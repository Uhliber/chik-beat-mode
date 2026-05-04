<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import PlayerSeat from './PlayerSeat.vue';
import BasesArea from './BasesArea.vue';
import SlamWheel, { type WheelTarget } from './SlamWheel.vue';
import BeatSliceOverlay from './BeatSliceOverlay.vue';
import { useSeatLayout } from '@/composables/useSeatLayout';
import { flyCardSlam, flyCardPenalty } from '@/composables/useCardAnimation';
import type { Game } from '@/game/Game';
import type { Card } from '@/game/Card';
import type { Player } from '@/game/Player';
import type { GameEvent, ChantWord, BaseSlot } from '@/game/types';

const props = defineProps<{
  game: Game;
  events: GameEvent[];
  speed: number;
  /** Reactive version stamp so we re-read the (shallow-ref) game state. */
  version: number;
  /** Game mode — 'play' shows the active-beat highlight + pie-slice overlay. */
  mode: 'simulation' | 'play';
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

// Responsive seat radius based on viewport.
const radius = ref(280);
const updateRadius = () => {
  if (!tableRef.value) return;
  const w = tableRef.value.clientWidth;
  const h = tableRef.value.clientHeight;
  const m = Math.min(w, h);
  radius.value = Math.max(150, Math.min(330, m * 0.36));
};

const playerCount = computed(() => props.game.players.length);
const { seats } = useSeatLayout(playerCount, radius);

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

function handleEvent(e: GameEvent) {
  if (e.kind === 'slam') {
    // Speech bubble.
    shoutCounter++;
    lastShouts.value = new Map(lastShouts.value).set(e.playerId, { word: e.shoutedWord, key: shoutCounter });
    // Highlight this as the last-played card across the table.
    lastPlayedCardId.value = e.cardId;

    // Find the source card element BEFORE Vue re-renders.
    const cardEl = findCardEl(e.cardId);
    const card = findCardObject(e.cardId);
    let targetEl = findBaseEl(e.targetBase);
    if (!targetEl) targetEl = findBaseEl('main');

    if (cardEl && targetEl && card) {
      const fromRect = captureRect(cardEl);
      const toRect = captureRect(targetEl);
      // Hide the source so the original "doesn't double".
      cardEl.style.visibility = 'hidden';
      markInFlight(e.cardId);
      flyCardSlam({
        cardId: e.cardId,
        fromEl: rectToEl(fromRect),
        toEl: rectToEl(toRect),
        faceUrl: card.assetPath,
        backUrl: '/cards/default-back.png',
        speed: props.speed,
        onComplete: () => clearInFlight(e.cardId),
      });
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
  <div ref="tableRef" class="relative w-full h-full overflow-hidden perspective-table">
    <!-- The tilted table surface -->
    <div
      class="absolute left-1/2 top-1/2 rounded-[40%/30%]"
      :style="{
        width: 'min(90vw, 1100px)',
        height: 'min(90vh, 760px)',
        transform: 'translate(-50%, -50%) rotateX(22deg)',
        background: 'radial-gradient(ellipse at 50% 40%, var(--color-table) 0%, var(--color-table-edge) 90%)',
        boxShadow: '0 30px 60px rgba(0, 0, 0, 0.35), inset 0 0 0 8px rgba(217, 199, 164, 0.5)',
      }"
    />

    <!-- Beat-mode pie overlay: highlights the active player's wedge of the table.
         Sits behind the bases / seats. Radius scales with the seat radius so the wedge
         always reaches comfortably under each seat. -->
    <div v-if="mode === 'play' && game.players.length > 0" class="absolute inset-0 pointer-events-none">
      <BeatSliceOverlay
        :players="game.players"
        :active-index="activeBeatSeatIndex"
        :radius="Math.round(radius * 0.78)"
        :inner-radius="Math.round(radius * 0.32)"
      />
    </div>

    <!-- Bases at the center -->
    <div
      class="absolute left-1/2 top-1/2"
      style="transform: translate(-50%, -50%); transform-style: preserve-3d;"
    >
      <BasesArea
        :game="game"
        :in-flight-ids="inFlightIds"
        :last-played-card-id="lastPlayedCardId"
      />
    </div>

    <!-- Player seats arranged radially. Each seat rotates so its hand fans toward the center.
         For the human seat we apply a small inward translation so the owned base (which now sits
         BELOW the hand) has room to render without clipping the viewport edge.
         The human seat also gets a high z-index so its (wider) fanned hand renders on top of
         any neighbouring seats and the event log. -->
    <div
      v-for="(seat, i) in seats"
      :key="game.players[i]?.id"
      class="absolute left-1/2 top-1/2"
      :style="{
        transform: game.players[i] && !game.players[i].isAI
          ? seat.transform + ' translateY(-90px)'
          : seat.transform,
        transformOrigin: 'center',
        zIndex: game.players[i] && !game.players[i].isAI ? 25 : 5,
      }"
      :data-seat-player="game.players[i]?.id"
    >
      <div class="absolute -translate-x-1/2 -translate-y-1/2">
        <PlayerSeat
          v-if="game.players[i]"
          :player="game.players[i]"
          :is-human-seat="!game.players[i].isAI"
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
