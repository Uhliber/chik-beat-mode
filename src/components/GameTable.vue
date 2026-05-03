<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import PlayerSeat from './PlayerSeat.vue';
import BasesArea from './BasesArea.vue';
import CardFan from './CardFan.vue';
import SlamWheel, { type WheelTarget } from './SlamWheel.vue';
import BeatSliceOverlay from './BeatSliceOverlay.vue';
import { useSeatLayout, type SeatLayoutMode } from '@/composables/useSeatLayout';
import { useResponsive } from '@/composables/useResponsive';
import { flyCardSlam, flyCardPenalty, bounceBackInPlace } from '@/composables/useCardAnimation';
import type { Game } from '@/game/Game';
import type { Card } from '@/game/Card';
import type { Player } from '@/game/Player';
import type { GameEvent, ChantWord, BaseSlot } from '@/game/types';
import type { SimMode } from '@/game/SimulationController';

const props = defineProps<{
  game: Game;
  events: GameEvent[];
  speed: number;
  /** Reactive version stamp so we re-read the (shallow-ref) game state. */
  version: number;
  /** Game mode — 'play' shows the active-beat highlight + pie-slice overlay; 'solo' is the time-attack variant. */
  mode: SimMode;
  /** Index in game.players of the active-beat seat (-1 outside Play mode / pre-open). */
  activeBeatSeatIndex: number;
  /** Tick index within the active player's turn (0..total-1; -1 outside Play mode). */
  activeBeatTickIndex: number;
  /** Total ticks in the active player's turn (drives the per-seat dot HUD). */
  activeBeatTotalTicks: number;
}>();

/** Pre-captured rects for the most recent slam, set synchronously inside the game listener. */
interface CapturedRect { x: number; y: number; width: number; height: number; }
/** Card IDs currently mid-flight to a base — BasePile hides them until landing. */
const inFlightIds = ref(new Set<string>());

function markInFlight(id: string) {
  const next = new Set(inFlightIds.value);
  next.add(id);
  inFlightIds.value = next;
}
function clearInFlight(id: string) {
  const next = new Set(inFlightIds.value);
  next.delete(id);
  inFlightIds.value = next;
}

const emit = defineEmits<{
  (e: 'slam-from-human', payload: { card: Card; player: Player; targetBase: BaseSlot }): void;
  (e: 'toggle-human', playerId: string): void;
}>();

const tableRef = ref<HTMLElement | null>(null);

/** ID of the most recently slammed card across the whole game. */
const lastPlayedCardId = ref<string | null>(null);

// -----------------------------------------------------------------------------
// Drag-to-slam aim mode (for human-controlled seats)
// -----------------------------------------------------------------------------

interface AimState {
  card: Card;
  player: Player;
  startX: number;
  startY: number;
  cursorX: number;
  cursorY: number;
  targets: WheelTarget[];
  /** True once the cursor has moved beyond CLICK_TOLERANCE_PX from the start. */
  hasDragged: boolean;
}

const aim = ref<AimState | null>(null);
/** Minimum movement to count as a drag (vs. a click). Below this, release commits to Main. */
const CLICK_TOLERANCE_PX = 8;
/** Drag distance below this with hasDragged=true → release in cancel zone. */
const AIM_THRESHOLD_PX = 60;

const highlightedSlot = computed<BaseSlot | ''>(() => {
  const a = aim.value;
  if (!a) return '';
  const dx = a.cursorX - a.startX;
  const dy = a.cursorY - a.startY;
  const dist = Math.hypot(dx, dy);
  if (dist < AIM_THRESHOLD_PX) return ''; // → main on commit
  const dragAngle = Math.atan2(dy, dx);
  let bestSlot: BaseSlot | '' = '';
  let bestDelta = Infinity;
  for (const t of a.targets) {
    const ta = Math.atan2(t.screenY - a.startY, t.screenX - a.startX);
    let d = Math.abs(dragAngle - ta);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d < bestDelta) {
      bestDelta = d;
      bestSlot = t.slot;
    }
  }
  return bestSlot;
});

function snapshotBaseTargets(): WheelTarget[] {
  const out: WheelTarget[] = [];
  // Wheel chips: only the OWNED word bases. Main is NOT a chip — it's the implicit
  // "click default" (release without ever dragging). Unowned word bases are skipped
  // (display-only in the center).
  for (const [slot, base] of props.game.bases) {
    if (slot === 'main') continue;
    if (!base.ownerId) continue;
    const el = document.querySelector<HTMLElement>(`[data-base-slot="${slot}"]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const topCard = base.pile[base.pile.length - 1];
    out.push({
      slot,
      label: slot.charAt(0).toUpperCase() + slot.slice(1),
      chipArt: topCard ? topCard.assetPath : `/cards/${slot}-base.png`,
      hasTopCard: !!topCard,
      screenX: r.left + r.width / 2,
      screenY: r.top + r.height / 2,
    });
  }
  return out;
}

/** Legal target slot for the Halo-Halo opening — Chik base if owned, else Main. */
function legalOpeningSlot(): BaseSlot {
  return props.game.bases.get('chik')?.ownerId ? 'chik' : 'main';
}

function onAimStart(payload: { card: Card; el: HTMLElement; clientX: number; clientY: number; player: Player }) {
  // SOLO: every slam goes to Main. No wheel chips, no opening filter — click OR drag,
  // either way, on release we always commit to 'main'.
  if (props.mode === 'solo') {
    aim.value = {
      card: payload.card,
      player: payload.player,
      startX: payload.clientX,
      startY: payload.clientY,
      cursorX: payload.clientX,
      cursorY: payload.clientY,
      targets: [],
      hasDragged: false,
    };
    window.addEventListener('pointermove', onAimMove);
    window.addEventListener('pointerup', onAimUp);
    window.addEventListener('pointercancel', onAimCancel);
    window.addEventListener('keydown', onAimKey);
    return;
  }
  // OPENING phase: only the Halo-Halo card is interactive. Other cards do nothing
  // (no aim mode at all → also no penalty path).
  if (!props.game.opened && !payload.card.isHaloHalo) {
    return;
  }
  let targets = snapshotBaseTargets();
  // While opening, restrict the wheel to the single legal target chip — disables
  // putting the Halo-Halo on any incorrect base, per spec.
  if (!props.game.opened && payload.card.isHaloHalo) {
    const legal = legalOpeningSlot();
    targets = targets.filter((t) => t.slot === legal);
  }
  aim.value = {
    card: payload.card,
    player: payload.player,
    startX: payload.clientX,
    startY: payload.clientY,
    cursorX: payload.clientX,
    cursorY: payload.clientY,
    targets,
    hasDragged: false,
  };
  window.addEventListener('pointermove', onAimMove);
  window.addEventListener('pointerup', onAimUp);
  window.addEventListener('pointercancel', onAimCancel);
  window.addEventListener('keydown', onAimKey);
}

function onAimMove(ev: PointerEvent) {
  const a = aim.value;
  if (!a) return;
  a.cursorX = ev.clientX;
  a.cursorY = ev.clientY;
  // Promote click → drag once the cursor moves beyond the click tolerance. Cheap to compute
  // each move; we stop checking once hasDragged is true so steady-state cost is one assignment.
  if (!a.hasDragged) {
    const dx = ev.clientX - a.startX;
    const dy = ev.clientY - a.startY;
    if (dx * dx + dy * dy >= CLICK_TOLERANCE_PX * CLICK_TOLERANCE_PX) {
      a.hasDragged = true;
    }
  }
}

function onAimUp() {
  const a = aim.value;
  if (!a) {
    cleanupAim();
    return;
  }

  // SOLO: only one target ever. The SlamWheel draws a cancel ring with radius
  // AIM_THRESHOLD_PX around the start point and switches its label/tint based on whether
  // the cursor is inside that ring. Mirror that geometry exactly:
  //  - tap (no drag) → slam Main
  //  - drag, release INSIDE the cancel ring → cancel (no slam)
  //  - drag, release OUTSIDE the cancel ring → slam Main (the player committed by
  //    dragging clear of the cancel zone)
  if (props.mode === 'solo') {
    const dx = a.cursorX - a.startX;
    const dy = a.cursorY - a.startY;
    const insideCancelRing = a.hasDragged && Math.hypot(dx, dy) < AIM_THRESHOLD_PX;
    if (!insideCancelRing) {
      emit('slam-from-human', { card: a.card, player: a.player, targetBase: 'main' });
    }
    cleanupAim();
    return;
  }

  // OPENING: we only ever entered aim mode for the Halo-Halo card. Any release commits
  // to the legal target — there's no penalty path during the opening, and no game state
  // to "cancel" out of yet. This guarantees the Halo-Halo can only land on the right place.
  if (!props.game.opened && a.card.isHaloHalo) {
    emit('slam-from-human', {
      card: a.card,
      player: a.player,
      targetBase: legalOpeningSlot(),
    });
    cleanupAim();
    return;
  }

  const slot = highlightedSlot.value;
  if (slot) {
    // Drag ended over a chip → slam that base.
    emit('slam-from-human', { card: a.card, player: a.player, targetBase: slot });
  } else if (!a.hasDragged) {
    // Pure click (no drag movement past CLICK_TOLERANCE_PX) → slam Main.
    emit('slam-from-human', { card: a.card, player: a.player, targetBase: 'main' });
  }
  // Otherwise: user dragged but released in the cancel zone → no slam.
  cleanupAim();
}

function onAimCancel() {
  cleanupAim();
}

function onAimKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') cleanupAim();
}

function cleanupAim() {
  aim.value = null;
  window.removeEventListener('pointermove', onAimMove);
  window.removeEventListener('pointerup', onAimUp);
  window.removeEventListener('pointercancel', onAimCancel);
  window.removeEventListener('keydown', onAimKey);
}

const { isMobile, width: viewportWidth } = useResponsive();

// Responsive seat radius. On mobile portrait, seats sit in the UPPER semicircle so the
// vertical budget is tighter — seat radius is smaller and clamped against viewport height.
const radius = ref(280);
const updateRadius = () => {
  if (!tableRef.value) return;
  const w = tableRef.value.clientWidth;
  const h = tableRef.value.clientHeight;
  if (isMobile.value) {
    // Bound by width (seats must fit horizontally) and by height/3 (P1 needs a hand area below).
    radius.value = Math.max(110, Math.min(160, Math.min(w * 0.40, h * 0.22)));
  } else {
    const m = Math.min(w, h);
    radius.value = Math.max(150, Math.min(330, m * 0.36));
  }
};

const playerCount = computed(() => props.game.players.length);
const seatLayoutMode = computed<SeatLayoutMode>(() => (isMobile.value ? 'semicircle' : 'radial'));
const { seats } = useSeatLayout(playerCount, radius, seatLayoutMode);

// Recompute the radius when the viewport mode flips (desktop ⇄ mobile breakpoint).
watch(isMobile, () => updateRadius());

const ro = new ResizeObserver(() => updateRadius());
watch(tableRef, (el) => {
  if (el) {
    ro.observe(el);
    updateRadius();
  }
});
onBeforeUnmount(() => ro.disconnect());

// Track the last slam per player for speech bubbles.
const lastShouts = ref(new Map<string, { word: ChantWord; key: number }>());
let shoutCounter = 0;

// Helper: locate a card element in any fan / pile by data-attribute.
function findCardEl(cardId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-card-id="${cardId}"]`)
    ?? document.querySelector<HTMLElement>(`[data-base-card-id="${cardId}"]`);
}
function findBaseEl(slot: BaseSlot): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-base-slot="${slot}"]`);
}
function findSeatEl(playerId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-seat-player="${playerId}"]`);
}

// Subscribe directly to game events SYNCHRONOUSLY so we can capture DOM rects
// before Vue's reactive system flushes the re-render that removes the card.
let unsub: (() => void) | null = null;
watch(
  () => props.game,
  (g) => {
    if (unsub) unsub();
    unsub = g.on(handleEvent);
    // Fresh game — reset visual state.
    lastPlayedCardId.value = null;
    lastShouts.value = new Map();
    inFlightIds.value = new Set();
  },
  { immediate: true },
);
onBeforeUnmount(() => { if (unsub) unsub(); });

function captureRect(el: HTMLElement): CapturedRect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

function rectToEl(rect: CapturedRect): HTMLElement {
  // Build a virtual element-shaped object for GSAP via a hidden anchor div.
  const anchor = document.createElement('div');
  anchor.style.cssText = `position: fixed; left: ${rect.x}px; top: ${rect.y}px; width: ${rect.width}px; height: ${rect.height}px; pointer-events: none; opacity: 0;`;
  document.body.appendChild(anchor);
  // Auto-remove shortly after.
  setTimeout(() => anchor.remove(), 50);
  return anchor;
}

// Solo auto-finish stagger: when the engine emits soloAutoFinish (player got stuck),
// the next batch of slam events all fire synchronously in the same tick. We assign each
// an ascending index so flyCardSlam can be deferred — otherwise 14 cards would burst
// from the halo at once, overlapping into a single blob at main. The flag clears via
// a microtask so subsequent unrelated slams aren't affected.
let autoFinishStaggerIndex = 0;
let autoFinishActive = false;
const AUTO_FINISH_STAGGER_MS = 90;

function handleEvent(e: GameEvent) {
  if (e.kind === 'soloAutoFinish') {
    autoFinishActive = true;
    autoFinishStaggerIndex = 0;
    // After this microtask flush, the burst is over — stop deferring.
    queueMicrotask(() => { autoFinishActive = false; });
    return;
  }
  if (e.kind === 'slam') {
    // Speech bubble.
    shoutCounter++;
    lastShouts.value = new Map(lastShouts.value).set(e.playerId, { word: e.shoutedWord, key: shoutCounter });
    // Highlight this as the last-played card across the table.
    lastPlayedCardId.value = e.cardId;

    // Find the source card element BEFORE Vue re-renders. If the slammed card isn't
    // currently rendered in any fan (e.g. opponent compact view caps at 5 visible cards
    // and the slammed card was buried behind the +N overflow), fall back to the seat
    // element as the flight origin — so the back→face flip animation ALWAYS runs.
    const cardEl = findCardEl(e.cardId);
    const card = findCardObject(e.cardId);
    let targetEl = findBaseEl(e.targetBase);
    if (!targetEl) targetEl = findBaseEl('main');
    const sourceEl = cardEl ?? findSeatEl(e.playerId);

    if (sourceEl && targetEl && card) {
      const fromRect = captureRect(sourceEl);
      const toRect = captureRect(targetEl);
      // Hide the source ONLY if it's the actual rendered card (not the seat fallback).
      if (cardEl) cardEl.style.visibility = 'hidden';
      markInFlight(e.cardId);
      // Solo auto-finish: defer each card's flight by a stagger so 14 cards arc into Main
      // sequentially instead of as a single overlapping burst. rectToEl is created INSIDE
      // the launch closure so the portal anchor's 50ms self-cleanup doesn't fire before
      // the deferred launch runs.
      const staggerMs = autoFinishActive ? autoFinishStaggerIndex++ * AUTO_FINISH_STAGGER_MS : 0;
      const launch = () => flyCardSlam({
        cardId: e.cardId,
        fromEl: rectToEl(fromRect),
        toEl: rectToEl(toRect),
        faceUrl: card.assetPath,
        backUrl: '/cards/default-back.png',
        speed: props.speed,
        onComplete: () => clearInFlight(e.cardId),
      });
      if (staggerMs > 0) setTimeout(launch, staggerMs);
      else launch();
    }
  } else if (e.kind === 'soloPenalty') {
    // Solo wrong-card: card stays in the halo. Animate a quick tug toward main + shake
    // on the actual mounted element so the player can see WHICH card was rejected.
    const cardEl = findCardEl(e.cardId);
    const mainEl = findBaseEl('main');
    if (cardEl && mainEl) {
      bounceBackInPlace(cardEl, mainEl, props.speed);
    }
  } else if (e.kind === 'penaltyTaken') {
    e.cardIds.forEach((cardId, i) => {
      const card = findCardObject(cardId);
      const fromBaseEl = findBaseEl(e.fromBase[i] ?? 'main');
      const toEl = findSeatEl(e.playerId);
      if (card && fromBaseEl && toEl) {
        const fromRect = captureRect(fromBaseEl);
        const toRect = captureRect(toEl);
        flyCardPenalty({
          fromEl: rectToEl(fromRect),
          toEl: rectToEl(toRect),
          faceUrl: card.assetPath,
          backUrl: '/cards/default-back.png',
          speed: props.speed,
        });
      }
    });
  }
}


/**
 * Solo-mode shim: CardFan emits without a `player` field, so we attach player[0] here.
 * Pre-open: ANY card click counts as "I want to start" — we substitute the Halo-Halo
 * card so the open always lands cleanly. The clicked-card identity is lost, but the
 * pulsing halo telegraphs that it's the real opener.
 */
function onSoloCardAim(payload: { card: Card; el: HTMLElement; clientX: number; clientY: number }) {
  const player = props.game.players[0];
  if (!player) return;
  let card = payload.card;
  if (!props.game.opened) {
    const halo = player.hand.find((c) => c.isHaloHalo);
    if (!halo) return;
    card = halo;
  }
  onAimStart({ ...payload, card, player });
}

/** Pre-open: pulse the Halo-Halo card to telegraph WHICH card is the actual opener. */
function soloCardPulse(cardId: string): boolean {
  if (props.game.opened) return false;
  const player = props.game.players[0];
  const card = player?.hand.find((c) => c.id === cardId);
  return !!card?.isHaloHalo;
}

/**
 * Solo mobile fan layers: split the player's hand into N stacked arcs at the bottom of
 * the screen. The FRONT-most layer (idx N-1) sits closest to the viewport bottom AND has
 * the highest z-index so it renders on top of the layers behind it. Each subsequent layer
 * back-stacks UPWARD (larger `bottom` value) and behind (lower z) — like a hand of cards
 * sliced into rows. Re-evaluates when the hand shrinks so layers re-distribute smoothly.
 */
const SOLO_LAYER_COUNT = 4;
const SOLO_LAYER_GAP_PX = 56;     // vertical distance between consecutive layers
const SOLO_BOTTOM_INSET_PX = 88;  // space reserved below the front-most layer for the foot bar
const soloLayeredFans = computed(() => {
  const hand = props.game.players[0]?.hand ?? [];
  if (hand.length === 0) return [];
  const n = Math.min(SOLO_LAYER_COUNT, Math.max(1, Math.ceil(hand.length / 4)));
  const perLayer = Math.ceil(hand.length / n);
  const layers: Array<{ idx: number; bottom: number; cards: Card[] }> = [];
  for (let i = 0; i < n; i++) {
    const slice = hand.slice(i * perLayer, (i + 1) * perLayer);
    if (slice.length === 0) break;
    layers.push({
      idx: i,
      // idx 0 = back layer (highest on screen), idx n-1 = front (lowest, on top z-wise).
      bottom: SOLO_BOTTOM_INSET_PX + (n - 1 - i) * SOLO_LAYER_GAP_PX,
      cards: slice,
    });
  }
  return layers;
});

function findCardObject(cardId: string): Card | null {
  for (const p of props.game.players) {
    const c = p.hand.find((x) => x.id === cardId);
    if (c) return c;
  }
  for (const b of props.game.bases.values()) {
    const c = b.pile.find((x) => x.id === cardId);
    if (c) return c;
  }
  return null;
}

// (Card-aim-start is forwarded directly via PlayerSeat → GameTable handlers.)
</script>

<template>
  <div
    ref="tableRef"
    class="relative w-full h-full overflow-hidden"
    :class="!isMobile ? 'perspective-table' : ''"
  >
    <!-- Table surface — tilted ellipse on desktop, flat rounded-rect on mobile. -->
    <div
      v-if="!isMobile"
      class="absolute left-1/2 top-1/2 rounded-[40%/30%]"
      :style="{
        width: 'min(90vw, 1100px)',
        height: 'min(90vh, 760px)',
        transform: 'translate(-50%, -50%) rotateX(22deg)',
        background: 'radial-gradient(ellipse at 50% 40%, var(--color-table) 0%, var(--color-table-edge) 90%)',
        boxShadow: '0 30px 60px rgba(0, 0, 0, 0.35), inset 0 0 0 8px rgba(217, 199, 164, 0.5)',
      }"
    />
    <div
      v-else
      class="absolute left-1/2 top-1/2 rounded-3xl"
      :style="{
        width: 'min(96vw, 460px)',
        height: 'min(82dvh, 760px)',
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(ellipse at 50% 35%, var(--color-table) 0%, var(--color-table-edge) 95%)',
        boxShadow: '0 18px 36px rgba(0, 0, 0, 0.30), inset 0 0 0 4px rgba(217, 199, 164, 0.5)',
      }"
    />

    <!-- Beat-mode pie overlay. Mode 'half' on mobile (top-half wedges = opponents,
         bottom-half = single P1 wedge). 'radial' on desktop. -->
    <div v-if="mode === 'play' && game.players.length > 0" class="absolute inset-0 pointer-events-none">
      <BeatSliceOverlay
        :players="game.players"
        :active-index="activeBeatSeatIndex"
        :radius="Math.round(radius * (isMobile ? 1.05 : 0.78))"
        :inner-radius="Math.round(radius * (isMobile ? 0.42 : 0.32))"
        :mode="isMobile ? 'half' : 'radial'"
      />
    </div>

    <!-- Bases at the center. Layered on mobile (unowned peek out behind main),
         row-aligned on desktop, solo = bigger main alone. Offset rules:
           - non-solo mobile  : UP  (-72px)  — keeps the bases clear of the bottom hand fan.
           - solo desktop     : DOWN (+80px) — keeps the halo centred around main.
           - solo mobile      : UP  (-90px) — main moves up to sit just below the ChantTicker
                                              so the U-shape pile owns the bottom half.
           - non-solo desktop : no offset. -->
    <div
      class="absolute left-1/2 top-1/2"
      :style="{
        transform: `translate(-50%, -50%)${
          mode === 'solo'
            ? (isMobile ? ' translateY(-120px)' : ' translateY(80px)')
            : (isMobile ? ' translateY(-72px)' : '')
        }`,
        transformStyle: 'preserve-3d',
        // Solo mobile: layered fans live below the main base; bump z to ensure the base
        // stays on top in the rare overlap (e.g. tall ChantTicker bubble + small viewport).
        zIndex: mode === 'solo' && isMobile ? 50 : 'auto',
      }"
    >
      <BasesArea
        :game="game"
        :in-flight-ids="inFlightIds"
        :last-played-card-id="lastPlayedCardId"
        :layout="mode === 'solo' ? 'solo' : isMobile ? 'layered' : 'row'"
        :compact="mode === 'solo' && isMobile"
      />
    </div>

    <!-- SOLO desktop: a single CardFan in 'circle' mode wraps the central main base.
         Click or drag a card → onAimStart → onAimUp → slam to Main. The vertical offset
         matches the BasesArea push-down so the halo stays centred around the main base
         AND clears the timer/ticker HUD. -->
    <div
      v-if="mode === 'solo' && !isMobile"
      class="absolute left-1/2 top-1/2"
      :style="{
        transform: 'translate(-50%, -50%) translateY(80px)',
      }"
      :data-seat-player="game.players[0]?.id"
    >
      <CardFan
        v-if="game.players[0]"
        :cards="game.players[0].hand"
        :face-up="true"
        :interactive="true"
        :card-width="56"
        fan-mode="circle"
        :circle-radius="Math.max(140, Math.min(280, radius * 0.95))"
        :card-pulse="soloCardPulse"
        @card-aim-start="onSoloCardAim"
      />
    </div>

    <!-- SOLO mobile: cards stacked into LAYERED FANS at the bottom of the screen. Each
         layer is a bottom-anchored arc; layers offset vertically with the FRONT-most layer
         (closest to screen bottom) sitting on top via z-index. Same click flow as before
         (card-aim-start → onSoloCardAim → onAimUp → slam to main). -->
    <template v-if="mode === 'solo' && isMobile && game.players[0]">
      <div
        v-for="layer in soloLayeredFans"
        :key="layer.idx"
        class="absolute left-1/2"
        :style="{
          bottom: `${layer.bottom}px`,
          transform: 'translateX(-50%)',
          zIndex: layer.idx,
        }"
        :data-seat-player="game.players[0]?.id"
      >
        <CardFan
          :cards="layer.cards"
          :face-up="true"
          :interactive="true"
          :card-width="60"
          :max-width="Math.min(viewportWidth - 24, 360)"
          :card-pulse="soloCardPulse"
          @card-aim-start="onSoloCardAim"
        />
      </div>
    </template>

    <!-- Player seats (Simulation / Play). Position via useSeatLayout (radial on desktop,
         semicircle on mobile). Desktop human seat lifts INWARD by 90px so the owned base
         (below the hand) has breathing room. Mobile opponent seats lift UPWARD by ~50px so
         their owned bases occupy the empty space above the central main base. -->
    <div
      v-if="mode !== 'solo'"
      v-for="(seat, i) in seats"
      :key="game.players[i]?.id"
      class="absolute left-1/2 top-1/2"
      :style="{
        transform: (() => {
          const t = seat.transform;
          const p = game.players[i];
          if (!p) return t;
          if (!isMobile && !p.isAI) return t + ' translateY(-90px)';
          if (isMobile && p.isAI) return t + ' translateY(-50px)';
          return t;
        })(),
        transformOrigin: 'center',
        // Active-beat seat sits ABOVE neighbours so cards/bubble/pill aren't covered by the
        // adjacent seats' content. Human seat (P1) keeps a high baseline z so its hand fan
        // also sits above neighbours.
        zIndex: mode === 'play' && i === activeBeatSeatIndex
          ? 35
          : (game.players[i] && !game.players[i].isAI ? 25 : 5),
      }"
      :data-seat-player="game.players[i]?.id"
    >
      <div class="absolute -translate-x-1/2 -translate-y-1/2">
        <PlayerSeat
          v-if="game.players[i]"
          :player="game.players[i]"
          :is-human-seat="!game.players[i].isAI"
          :compact="isMobile && !!game.players[i].isAI"
          :is-active-beat="mode === 'play' && i === activeBeatSeatIndex"
          :beat-tick-index="i === activeBeatSeatIndex ? activeBeatTickIndex : -1"
          :beat-total-ticks="activeBeatTotalTicks"
          :owned-base-pile="game.players[i].ownedBaseWord ? game.getBase(game.players[i].ownedBaseWord!) : null"
          :shouted="lastShouts.get(game.players[i].id)?.word ?? null"
          :shout-key="lastShouts.get(game.players[i].id)?.key ?? 0"
          :in-flight-ids="inFlightIds"
          :last-played-card-id="lastPlayedCardId"
          @card-aim-start="onAimStart"
          @toggle-human="(id: string) => emit('toggle-human', id)"
        />
      </div>
    </div>

    <!-- Slam-aim wheel overlay -->
    <SlamWheel
      v-if="aim"
      :card-art="aim.card.assetPath"
      :start-x="aim.startX"
      :start-y="aim.startY"
      :cursor-x="aim.cursorX"
      :cursor-y="aim.cursorY"
      :targets="aim.targets"
      :highlighted-slot="highlightedSlot"
      :threshold="AIM_THRESHOLD_PX"
      :has-dragged="aim.hasDragged"
    />
  </div>
</template>
