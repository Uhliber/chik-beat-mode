<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import PlayerSeat from './PlayerSeat.vue';
import BasesArea from './BasesArea.vue';
import SlamWheel, { type WheelTarget } from './SlamWheel.vue';
import TurnWisp from './TurnWisp.vue';
import TableSurface from './TableSurface.vue';
import SnapDrawnOverlay from './SnapDrawnOverlay.vue';
import ChantTriggerOverlay from './ChantTriggerOverlay.vue';
import { useSeatLayout } from '@/composables/useSeatLayout';
import { useResponsive } from '@/composables/useResponsive';
import { flyCardSlam, flyCardDraw } from '@/composables/useCardAnimation';
import type { FlightSpec } from '@/composables/useGame';
import type { Game } from '@/game/Game';
import type { Card } from '@/game/Card';
import type { Player } from '@/game/Player';
import type { BaseSide, ChantWord, GameEvent } from '@/game/types';
import type { SimMode } from '@/game/SimulationController';
import { modeCaps } from '@/game/modes';

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
  /** Pending snap-drawn state (Versus only). When set, an inline overlay anchored to
   *  the deck shows the drawn snap card + target chips. */
  pendingSnapCard?: Card | null;
  pendingSnapHolderSeat?: number;
  pendingSnapLegalTargets?: number[];
  pendingSnapInteractive?: boolean;
  pendingSnapAiPick?: number | null;
  /** User's prompt-size preference. Threads through to PlayerSeat (Versus) and the Solo
   *  BasesArea so the active prompt scales to taste. */
  promptSize?: 'small' | 'medium' | 'large' | 'xl';
  /** User's preferred size for the floating prompt+count popover ('off' = hide). */
  promptInfoSize?: import('@/composables/userPreferences').PromptInfoSize;
  /** When true, the human's Halo-Halo Chik pulses + glows to invite the opening play.
   *  Parent (PlayView) flips this on during idle/opening status; off otherwise. */
  pulseHaloHalo?: boolean;
  /** v1.2 Beat ownership — beats claimed by each seat (key = seat index). */
  beatsBySeat?: Map<number, ChantWord[]>;
  /** v1.2 Setup phase — current beat picker seat. -1/null when not in setup. */
  currentBeatPickerSeat?: number | null;
  /** v1.2 Chant Trigger overlay state. */
  chantTriggerActive?: boolean;
  chantTriggerLandedBeat?: ChantWord | 'no-winner-opening' | 'no-winner-unclaimed' | null;
  chantTriggerWinnerSeat?: number | null;
  chantTriggerTotal?: number;
  chantTriggerReceiverSeat?: number | null;
  /** Per-seat recital state. Step counter & shouts driven by useGame. */
  chantRecitalStepsBySeat?: Map<number, number>;
  chantRecitalCurrentSeat?: number | null;
  /** Per-seat starting beat index for the chant recital (which beat word each pip
   *  represents — derived from receiverSeatIndex + perSeatCounts). */
  chantStartStepBySeat?: Map<number, number>;
  recitalShouts?: Record<number, { word: ChantWord; key: number }>;
}>();

const emit = defineEmits<{
  (e: 'solo-slam', payload: { cardId: string; baseSide: BaseSide }): void;
  (e: 'versus-play', payload: { cardId: string; targetSeatIndex: number }): void;
  (e: 'snap-target', seatIndex: number): void;
  (e: 'draw-deck-click'): void;
}>();

const { isMobile, width: viewportW, height: viewportH } = useResponsive();

/** Mode capability flags. Branch on these instead of `mode === 'solo'` etc. so new
 *  modes only need a row in MODE_CAPS, not a hunt across this component. */
const caps = computed(() => modeCaps(props.mode));

// ---- Seat layout ----
const radius = computed(() => {
  if (caps.value.isSingleSeat) return 0;
  const d = Math.min(viewportW.value, viewportH.value);
  return Math.max(140, Math.round(d * 0.32));
});
const seatLayoutMode = computed(() => {
  if (caps.value.isSingleSeat) return 'solo' as const;
  return isMobile.value ? ('semicircle' as const) : ('radial' as const);
});
const playerCount = computed(() => props.game.players.length);
const { seats } = useSeatLayout(playerCount, radius, seatLayoutMode);

/** Solo bases always render at this fixed width regardless of the promptSize setting —
 *  the user's promptSize preference only affects the CLONE that surfaces behind the
 *  human's hand (see soloHumanCloneCard below). Keeping the table bases at a stable
 *  size leaves the centre of the table balanced against the deck. */
const SOLO_BASE_CARD_WIDTH = 64;
/** Solo XL: render a CLONE of the active prompt above the human's hand (mirroring how
 *  Versus renders the human's promptStack). Lookup walks both Solo bases to find the
 *  card whose id matches the engine's `soloActiveCardId`. Returns null whenever a clone
 *  shouldn't be shown — non-Solo modes, non-XL sizes, or no active prompt yet.
 *
 *  Reactivity note: `game.soloActiveCardId` is a plain field on the Game class, not a
 *  reactive proxy, so reads of it aren't tracked. Touching the .length of both reactive
 *  `soloBases` arrays makes this computed re-evaluate on every slam (which is exactly
 *  when soloActiveCardId can change), so the clone follows the most recent play. */
const soloHumanCloneCard = computed(() => {
  if (props.mode !== 'solo' || (props.promptSize ?? 'medium') !== 'xl') return null;
  void props.game.soloBases.left.length;
  void props.game.soloBases.right.length;
  const id = props.game.soloActiveCardId;
  if (!id) return null;
  const left = props.game.soloBases.left.find((c) => c.id === id);
  if (left) return left;
  return props.game.soloBases.right.find((c) => c.id === id) ?? null;
});

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
  if (!caps.value.usesSoloBases) {
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
  const targets = caps.value.usesSoloBases
    ? snapshotSoloTargets()
    : snapshotVersusTargets(payload.card, payload.player.seatIndex);

  // Turn-based modes: if no legal targets exist for this card, swallow the press
  // silently — there's nowhere to throw, so don't even open the aim ring.
  if (caps.value.isTurnBased && targets.length === 0) return;

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
  if (caps.value.usesSoloBases) {
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
/**
 * Card IDs that just LANDED in someone's hand (draw flight complete). CardFan applies
 * a brief CSS slide-in animation for each id in this set. We clear ids ~520ms after
 * insert — the keyframe runs 380ms, with a buffer so the class is gone before another
 * frame paints. */
const freshCardIds = ref<Set<string>>(new Set());

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

// When the Chant Trigger overlay tears down, wipe the local play-shouts state. The
// recitalShouts map clears at the same moment, so effectiveShout for every recital
// participant would otherwise FALL BACK to a stale play-shout (the chant chik play
// from before the trigger, or anything older still in the map). That fallback
// re-triggers PlayerSeat's bubble watcher for every seat simultaneously — the
// "everyone shouted altogether" flash. Clearing here means the merge returns null,
// the watcher's `!props.shouted` guard kicks in, and no rogue bubbles fire.
watch(
  () => props.chantTriggerActive,
  (active, prevActive) => {
    if (prevActive && !active) {
      shouts.value = {};
    }
  },
);

/** Merge normal-play shouts with Chant Trigger recital shouts. The recital fires the
 *  same SpeechBubble system as a regular play, but driven by useGame's recital walk. We
 *  prefer the recital shout when active so the chant overrides any stale play shout. */
function effectiveShout(seatIdx: number): { word: ChantWord; key: number } | null {
  const recital = props.recitalShouts?.[seatIdx];
  if (recital) return recital;
  return shouts.value[seatIdx] ?? null;
}

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
    if (spec.kind !== 'draw') {
      lastPlayedCardId.value = spec.cardId;
    } else {
      // Card just landed in its owner's hand. Mark it "fresh" so CardFan plays the
      // slide-in keyframe; drop the mark after the keyframe is done so a future redraw
      // (e.g. on resize) doesn't re-trigger the animation.
      freshCardIds.value = new Set(freshCardIds.value).add(spec.cardId);
      setTimeout(() => {
        const after = new Set(freshCardIds.value);
        after.delete(spec.cardId);
        freshCardIds.value = after;
      }, 520);
    }
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
    :class="{ 'ambiance-chant-resolve': chantTriggerActive }"
    data-game-table
  >
    <!-- 1. The tabletop — perspective-tilted rounded rect at the back of the stacking
         context. Everything else paints on top. -->
    <TableSurface />

    <!-- 2. Turn-indicator wisp (Versus + Playground — anything turn-based). Paints
         above the tabletop but BEFORE the seats / bases (source-order stacking) so
         the pill text & cards remain readable. -->
    <TurnWisp
      v-if="caps.isTurnBased"
      :seat-index="activeSeatIndex"
      :enabled="wispEnabled ?? true"
    />

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
        :prompt-card-width="SOLO_BASE_CARD_WIDTH"
        :prompt-size="promptSize"
        @draw-deck-click="emit('draw-deck-click')"
      />
    </div>

    <!-- Opponent seats arrayed around the table (only multi-seat modes). -->
    <template v-if="!caps.isSingleSeat">
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
          :shouted="effectiveShout(p.seatIndex)?.word ?? null"
          :shout-key="effectiveShout(p.seatIndex)?.key ?? 0"
          :fresh-card-ids="freshCardIds"
          :compact="isMobile"
          :prompt-size="promptSize"
          :owned-beats="beatsBySeat?.get(p.seatIndex) ?? []"
          :is-beat-picker="currentBeatPickerSeat === p.seatIndex"
          :chant-recital-active="chantTriggerActive && chantRecitalCurrentSeat === p.seatIndex"
          :chant-pips-lit="chantRecitalStepsBySeat?.get(p.seatIndex) ?? 0"
          :chant-pips-start-step="chantStartStepBySeat?.get(p.seatIndex) ?? 0"
          :chant-trigger-in-flight="chantTriggerActive ?? false"
          :prompt-info-size="promptInfoSize"
          :seat-rotation="seats[i]?.rotation ?? 0"
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
        :is-active="caps.isTurnBased ? activeSeatIndex === humanSeat.seatIndex : true"
        :hidden-ids="inFlightIds"
        :last-played-card-id="lastPlayedCardId"
        :shouted="effectiveShout(humanSeat.seatIndex)?.word ?? null"
        :shout-key="effectiveShout(humanSeat.seatIndex)?.key ?? 0"
        :fresh-card-ids="freshCardIds"
        :prompt-size="promptSize"
        :extra-prompt-card="soloHumanCloneCard"
        :pulse-halo-halo="pulseHaloHalo"
        :owned-beats="beatsBySeat?.get(humanSeat.seatIndex) ?? []"
        :is-beat-picker="currentBeatPickerSeat === humanSeat.seatIndex"
        :chant-recital-active="chantTriggerActive && chantRecitalCurrentSeat === humanSeat.seatIndex"
        :chant-pips-lit="chantRecitalStepsBySeat?.get(humanSeat.seatIndex) ?? 0"
        :chant-pips-start-step="chantStartStepBySeat?.get(humanSeat.seatIndex) ?? 0"
        :chant-trigger-in-flight="chantTriggerActive ?? false"
        :prompt-info-size="promptInfoSize"
        @card-aim-start="onAimStart"
      />
    </div>

    <!-- Chant Trigger overlay (spotlight + banner). The clockwise recital itself is
         driven by per-seat SpeechBubble pops via the shout merging above. -->
    <ChantTriggerOverlay
      :active="!!chantTriggerActive"
      :landed-beat="chantTriggerLandedBeat ?? null"
      :winner-seat-index="chantTriggerWinnerSeat ?? null"
      :total="chantTriggerTotal ?? 0"
      :receiver-seat-index="chantTriggerReceiverSeat ?? null"
    />

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

    <!-- Snap-drawn overlay — inline, anchored to the deck. Shown in any mode that
         uses prompt stacks (Snap mechanic only exists with the prompt system). -->
    <SnapDrawnOverlay
      v-if="caps.usesPromptStacks && pendingSnapCard"
      :card="pendingSnapCard"
      :players="game.players"
      :holder-seat-index="pendingSnapHolderSeat ?? -1"
      :legal-targets="pendingSnapLegalTargets ?? []"
      :interactive="pendingSnapInteractive ?? false"
      :ai-picked-target="pendingSnapAiPick ?? null"
      @click-target="(seat) => emit('snap-target', seat)"
    />
  </div>
</template>
