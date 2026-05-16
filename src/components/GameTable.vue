<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import PlayerSeat from './PlayerSeat.vue';
import BasesArea from './BasesArea.vue';
import SlamWheel, { type WheelTarget } from './SlamWheel.vue';
import TurnWisp from './TurnWisp.vue';
import { useSeatLayout } from '@/composables/useSeatLayout';
import { useResponsive } from '@/composables/useResponsive';
import { flyCardSlam, flyCardDraw } from '@/composables/useCardAnimation';
import type { FlightSpec } from '@/composables/useGame';
import type { Game } from '@/game/Game';
import type { Card } from '@/game/Card';
import type { Player } from '@/game/Player';
import type { BaseSide, ChantWord, GameEvent } from '@/game/types';
import type { SimMode } from '@/game/SimulationController';

const props = defineProps<{
  game: Game;
  events: GameEvent[];
  version: number;
  mode: SimMode;
  /** Speed multiplier — passed through to the flight animation so AI-vs-AI runs at the
   *  same cadence as the controller's think delays. 1 = stock duration. */
  speed?: number;
  /** Versus only: which seat's turn is it (-1 = none / Solo). */
  activeSeatIndex: number;
  /** Animation queue populated by useGame; we drain by id and dispatch flights. */
  pendingFlights: FlightSpec[];
  /** When true (Versus only), render the moving turn-indicator wisp. */
  wispEnabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'solo-slam', payload: { cardId: string; baseSide: BaseSide }): void;
  (e: 'versus-play', payload: { cardId: string; targetSeatIndex: number }): void;
  (e: 'draw-deck-click'): void;
}>();

const { isMobile, width: viewportW, height: viewportH } = useResponsive();

// ---- Seat layout ----
const radius = computed(() => {
  if (props.mode === 'solo') return 0;
  const d = Math.min(viewportW.value, viewportH.value);
  return Math.max(140, Math.round(d * 0.32));
});
const seatLayoutMode = computed(() => {
  if (props.mode === 'solo') return 'solo' as const;
  return isMobile.value ? ('semicircle' as const) : ('radial' as const);
});
const playerCount = computed(() => props.game.players.length);
const { seats } = useSeatLayout(playerCount, radius, seatLayoutMode);

// ---- Drag-aim state ----
interface AimState {
  card: Card;
  player: Player;
  startX: number;
  startY: number;
  cursorX: number;
  cursorY: number;
  hasDragged: boolean;
  targets: WheelTarget[];
}
const aim = ref<AimState | null>(null);
const CLICK_TOLERANCE_PX = 8;
const AIM_THRESHOLD_PX = 60;

// Solo highlight passes to BasesArea so the chosen base glows.
const highlightedSoloSide = ref<BaseSide | null>(null);

/** Currently-highlighted wheel target id ('' = none / cursor in cancel zone). */
const highlightedId = computed<string | ''>(() => {
  const a = aim.value;
  if (!a) return '';
  const dx = a.cursorX - a.startX;
  const dy = a.cursorY - a.startY;
  const dist = Math.hypot(dx, dy);
  if (dist < AIM_THRESHOLD_PX) return '';
  if (a.targets.length === 0) return '';
  const cursorAngle = Math.atan2(dy, dx);
  let bestId: string | '' = '';
  let bestDelta = Infinity;
  for (const t of a.targets) {
    const ta = Math.atan2(t.screenY - a.startY, t.screenX - a.startX);
    let d = Math.abs(cursorAngle - ta);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d < bestDelta) {
      bestDelta = d;
      bestId = t.id;
    }
  }
  return bestId;
});

/** Sync the BasesArea highlight ring to whichever solo target is currently picked. */
watch(highlightedId, (id) => {
  if (props.mode !== 'solo') {
    highlightedSoloSide.value = null;
    return;
  }
  highlightedSoloSide.value = id === 'left' || id === 'right' ? id : null;
});

// ---- Target builders ----

function snapshotSoloTargets(): WheelTarget[] {
  const out: WheelTarget[] = [];
  for (const side of ['left', 'right'] as const) {
    const el = document.querySelector<HTMLElement>(`[data-base-id="${side}"]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const pile = props.game.soloBases[side];
    const topCard = pile[pile.length - 1];
    out.push({
      id: side,
      label: side === 'left' ? 'Left' : 'Right',
      chipArt: topCard ? topCard.assetPath : '',
      hasTopCard: !!topCard,
      screenX: r.left + r.width / 2,
      screenY: r.top + r.height / 2,
    });
  }
  return out;
}

function snapshotVersusTargets(card: Card, seatIdx: number): WheelTarget[] {
  const legal = new Set(props.game.legalTargetSeats(seatIdx, card));
  const out: WheelTarget[] = [];
  for (const target of props.game.players) {
    if (target.seatIndex === seatIdx) continue;
    if (!legal.has(target.seatIndex)) continue;
    const el = document.querySelector<HTMLElement>(`[data-seat-index="${target.seatIndex}"]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const prompt = target.topPrompt;
    out.push({
      id: String(target.seatIndex),
      label: target.id.toUpperCase(),
      chipArt: prompt ? prompt.assetPath : '',
      hasTopCard: !!prompt,
      screenX: r.left + r.width / 2,
      screenY: r.top + r.height / 2,
    });
  }
  return out;
}

function onAimStart(payload: { card: Card; el: HTMLElement; clientX: number; clientY: number; player: Player }) {
  const targets = props.mode === 'solo'
    ? snapshotSoloTargets()
    : snapshotVersusTargets(payload.card, payload.player.seatIndex);

  // Versus: if no legal targets exist for this card, swallow the press silently —
  // there's nowhere to throw the card, so don't even open the aim ring.
  if (props.mode === 'versus' && targets.length === 0) return;

  aim.value = {
    card: payload.card,
    player: payload.player,
    startX: payload.clientX,
    startY: payload.clientY,
    cursorX: payload.clientX,
    cursorY: payload.clientY,
    hasDragged: false,
    targets,
  };
  window.addEventListener('pointermove', onAimMove);
  window.addEventListener('pointerup', onAimUp);
  window.addEventListener('pointercancel', cleanupAim);
}

function onAimMove(ev: PointerEvent) {
  const a = aim.value;
  if (!a) return;
  a.cursorX = ev.clientX;
  a.cursorY = ev.clientY;
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
  const hid = highlightedId.value;
  cleanupAim();
  if (!a) return;
  const dist = Math.hypot(a.cursorX - a.startX, a.cursorY - a.startY);
  if (dist < AIM_THRESHOLD_PX || !hid) return; // cancel
  if (props.mode === 'solo') {
    if (hid === 'left' || hid === 'right') {
      emit('solo-slam', { cardId: a.card.id, baseSide: hid });
    }
  } else {
    const seat = Number(hid);
    if (!Number.isNaN(seat)) {
      emit('versus-play', { cardId: a.card.id, targetSeatIndex: seat });
    }
  }
}

function cleanupAim() {
  aim.value = null;
  highlightedSoloSide.value = null;
  window.removeEventListener('pointermove', onAimMove);
  window.removeEventListener('pointerup', onAimUp);
  window.removeEventListener('pointercancel', cleanupAim);
}

onBeforeUnmount(cleanupAim);

/** Card IDs mid-flight from one location to another. Hidden in the destination pile until
 *  the GSAP timeline completes, so the flying clone is the ONLY visible copy during travel. */
const inFlightIds = ref(new Set<string>());
/** ID of the most recently played card across the whole table. BasePile renders a pulse
 *  glow on the matching card so the player can spot what just happened. */
const lastPlayedCardId = ref<string | null>(null);

const humanSeat = computed<Player | null>(() => {
  void props.version;
  return props.game.players.find((p) => !p.isAI) ?? null;
});

watch(() => props.game, cleanupAim);

// ---- Card flight animations (Versus + Solo) ----
//
// Rects are pre-captured inside useGame.handleEvent at event-emission time — BEFORE Vue
// re-renders the source's hand (one card lighter, slightly re-centered). We just drain
// the queue here and dispatch GSAP timelines. The inFlightIds set hides the card from
// the destination pile until the flight lands, so only the flying clone is visible
// during travel.

const draining = ref<Set<number>>(new Set());
/** Per-seat shout state — fires the speech bubble above the source player on each play. */
const shouts = ref<Record<number, { word: ChantWord; key: number }>>({});

watch(
  () => props.pendingFlights.length,
  () => {
    for (const spec of props.pendingFlights) {
      if (draining.value.has(spec.id)) continue;
      draining.value.add(spec.id);
      dispatchFlight(spec);
    }
  },
  { immediate: true },
);

function dispatchFlight(spec: FlightSpec): void {
  inFlightIds.value = new Set(inFlightIds.value).add(spec.cardId);
  if (spec.shoutWord != null && spec.shoutSeatIndex != null) {
    const seat = spec.shoutSeatIndex;
    const prev = shouts.value[seat]?.key ?? 0;
    shouts.value = { ...shouts.value, [seat]: { word: spec.shoutWord, key: prev + 1 } };
  }
  const onComplete = () => {
    const next = new Set(inFlightIds.value);
    next.delete(spec.cardId);
    inFlightIds.value = next;
    if (spec.kind !== 'draw') lastPlayedCardId.value = spec.cardId;
  };

  if (spec.kind === 'draw') {
    flyCardDraw({
      fromEl: document.body, // unused — fromRect wins
      toEl: document.body,
      fromRect: spec.fromRect,
      toRect: spec.toRect,
      faceUrl: spec.faceUrl || undefined,
      backUrl: '/cards/default-back.png',
      speed: props.speed ?? 1,
      revealFace: spec.revealFace,
      onComplete,
    });
  } else {
    flyCardSlam({
      cardId: spec.cardId,
      fromEl: document.body,
      toEl: document.body,
      fromRect: spec.fromRect,
      toRect: spec.toRect,
      faceUrl: spec.faceUrl,
      backUrl: '/cards/default-back.png',
      speed: props.speed ?? 1,
      onComplete,
    });
  }
}
</script>

<template>
  <div
    class="relative w-full h-full flex items-end justify-center"
    data-game-table
  >
    <!-- Center area (bases + draw pile) -->
    <div
      class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
    >
      <BasesArea
        :game="game"
        :mode="mode"
        :highlighted-side="highlightedSoloSide"
        :hidden-ids="inFlightIds"
        :last-played-card-id="lastPlayedCardId"
        @draw-deck-click="emit('draw-deck-click')"
      />
    </div>

    <!-- Versus: opponent seats arrayed around the table -->
    <template v-if="mode === 'versus'">
      <div
        v-for="(p, i) in game.players"
        :key="p.id"
        class="absolute left-1/2 top-1/2"
        :style="{
          transform: `translate(-50%, -50%) ${seats[i]?.transform ?? 'translate(0,0)'}`,
        }"
      >
        <PlayerSeat
          v-if="p !== humanSeat"
          :player="p"
          :is-human-seat="false"
          :is-active="activeSeatIndex === p.seatIndex"
          :is-legal-target="highlightedId === String(p.seatIndex)"
          :hidden-ids="inFlightIds"
          :last-played-card-id="lastPlayedCardId"
          :shouted="shouts[p.seatIndex]?.word ?? null"
          :shout-key="shouts[p.seatIndex]?.key ?? 0"
          :compact="isMobile"
        />
      </div>
    </template>

    <!-- Human seat (bottom, both modes) -->
    <div
      class="absolute left-1/2 bottom-3 -translate-x-1/2"
    >
      <PlayerSeat
        v-if="humanSeat"
        :player="humanSeat"
        :is-human-seat="true"
        :is-active="mode === 'versus' ? activeSeatIndex === humanSeat.seatIndex : true"
        :hidden-ids="inFlightIds"
        :last-played-card-id="lastPlayedCardId"
        :shouted="shouts[humanSeat.seatIndex]?.word ?? null"
        :shout-key="shouts[humanSeat.seatIndex]?.key ?? 0"
        @card-aim-start="onAimStart"
      />
    </div>

    <!-- Slam wheel overlay (during aim) -->
    <SlamWheel
      v-if="aim"
      :card-art="aim.card.assetPath"
      :start-x="aim.startX"
      :start-y="aim.startY"
      :cursor-x="aim.cursorX"
      :cursor-y="aim.cursorY"
      :targets="aim.targets"
      :highlighted-id="highlightedId"
      :threshold="AIM_THRESHOLD_PX"
      :has-dragged="aim.hasDragged"
    />

    <!-- Turn-indicator wisp (Versus only). Solo has one player — no turn to track. -->
    <TurnWisp
      v-if="mode === 'versus'"
      :seat-index="activeSeatIndex"
      :enabled="wispEnabled ?? true"
    />
  </div>
</template>
