<script setup lang="ts">
/**
 * Inline overlay for the "Snap drawn and matches the beat" moment. Anchored to the
 * deck inside GameTable rather than a modal — the drawn snap card flips up + offsets
 * slightly above the deck and a ring of target chips appears around it.
 *
 *  - Human's pending snap: chips are clickable. Click one → submit snap-play.
 *  - AI's pending snap: chips are read-only; the AI's chosen chip (passed in as
 *    `aiPickedTarget`) glows so the player can see the AI's decision before the
 *    engine commits the play (~900ms later, scheduled by the controller).
 *
 * In strict-prompts mode the engine returns ALL non-self seats as legal; the overlay
 * surfaces them all as chips so the human can target anyone.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import CardView from './CardView.vue';
import type { Card } from '@/game/Card';
import type { Player } from '@/game/Player';

const props = defineProps<{
  /** The drawn snap card (face-up). Null = overlay hidden. */
  card: Card | null;
  /** All seats — to compute label and chip positions. */
  players: Player[];
  /** Seat index of the snap's holder. -1 hides. */
  holderSeatIndex: number;
  /** Legal target seat indices (computed by the engine, respects strict mode). */
  legalTargets: number[];
  /** When true, chips are clickable and `click-target` fires on tap. False = read-only. */
  interactive: boolean;
  /** If set (AI mode), this chip pulses to telegraph the AI's about-to-commit choice. */
  aiPickedTarget?: number | null;
}>();

const emit = defineEmits<{
  (e: 'click-target', seatIndex: number): void;
}>();

/** Local-coordinate (parent = GameTable) anchor points. Recomputed on every show +
 *  window resize, since the deck and seat elements move with viewport changes. */
interface Anchors {
  deck: { x: number; y: number };
  seats: Record<number, { x: number; y: number }>;
}
const anchors = ref<Anchors | null>(null);
const overlayEl = ref<HTMLElement | null>(null);

function computeAnchors(): void {
  if (!overlayEl.value) return;
  const deck = document.querySelector<HTMLElement>('[data-base-id="deck"]');
  const parent = overlayEl.value.offsetParent as HTMLElement | null;
  if (!deck || !parent) return;
  const parentRect = parent.getBoundingClientRect();
  const deckRect = deck.getBoundingClientRect();
  const deckCentre = {
    x: deckRect.left + deckRect.width / 2 - parentRect.left,
    y: deckRect.top + deckRect.height / 2 - parentRect.top,
  };
  const seats: Record<number, { x: number; y: number }> = {};
  for (const target of props.legalTargets) {
    const el = document.querySelector<HTMLElement>(`[data-seat-index="${target}"]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    seats[target] = {
      x: r.left + r.width / 2 - parentRect.left,
      y: r.top + r.height / 2 - parentRect.top,
    };
  }
  anchors.value = { deck: deckCentre, seats };
}

let resizeObs: ResizeObserver | null = null;
onMounted(() => {
  computeAnchors();
  resizeObs = new ResizeObserver(() => computeAnchors());
  resizeObs.observe(document.body);
});
onBeforeUnmount(() => {
  if (resizeObs) resizeObs.disconnect();
});
watch(() => props.card, (c) => { if (c) requestAnimationFrame(computeAnchors); });
watch(() => props.holderSeatIndex, () => requestAnimationFrame(computeAnchors));
watch(() => props.legalTargets, () => requestAnimationFrame(computeAnchors));

/** Place each chip on the ray from the deck centre toward the target seat's actual
 *  DOM position, at a fixed radius. So the "P4" chip appears in the direction P4
 *  is sitting — left chip ↔ left seat, regardless of legalTargets[] ordering. If a
 *  seat anchor isn't yet measurable, the chip falls back to an even fan around the deck. */
const chipPositions = computed(() => {
  if (!anchors.value || props.legalTargets.length === 0) return [];
  const a = anchors.value;
  const radius = 120;
  const n = props.legalTargets.length;
  return props.legalTargets.map((seat, i) => {
    const seatAnchor = a.seats[seat];
    let dx: number;
    let dy: number;
    if (seatAnchor) {
      const vx = seatAnchor.x - a.deck.x;
      const vy = seatAnchor.y - a.deck.y;
      const len = Math.hypot(vx, vy) || 1;
      dx = (vx / len) * radius;
      dy = (vy / len) * radius;
    } else {
      // Fallback: even fan around the deck if a seat element isn't measurable yet.
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      dx = Math.cos(angle) * radius;
      dy = Math.sin(angle) * radius;
    }
    return {
      seat,
      x: a.deck.x + dx,
      y: a.deck.y + dy,
      label: props.players[seat]?.id?.toUpperCase() ?? `P${seat + 1}`,
      isAiPick: props.aiPickedTarget === seat,
    };
  });
});

/** Card sits about 60px above the deck centre so it's not occluded by the deck face. */
const cardOffset = 60;
</script>

<template>
  <div
    v-if="card && holderSeatIndex >= 0"
    ref="overlayEl"
    class="snap-overlay"
    aria-hidden="true"
  >
    <div v-if="anchors" class="snap-stage">
      <!-- Flipped-up snap card, offset above the deck. Pulses gently to telegraph
           "this needs attention". -->
      <div
        class="snap-card-wrap"
        :style="{
          left: anchors.deck.x + 'px',
          top: (anchors.deck.y - cardOffset) + 'px',
        }"
      >
        <div class="snap-card-inner">
          <CardView :card="card" :face-up="true" :width="72" :static-flip="true" />
        </div>
      </div>

      <!-- Target chips, fanned around the deck. -->
      <button
        v-for="chip in chipPositions"
        :key="chip.seat"
        type="button"
        class="snap-chip"
        :class="{ 'is-ai-pick': chip.isAiPick, 'is-readonly': !interactive }"
        :style="{
          left: chip.x + 'px',
          top: chip.y + 'px',
        }"
        :disabled="!interactive"
        @click="interactive && emit('click-target', chip.seat)"
      >
        {{ chip.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.snap-overlay {
  position: absolute;
  inset: 0;
  z-index: 28;
  pointer-events: none;
}
.snap-stage {
  position: absolute;
  inset: 0;
}

.snap-card-wrap {
  position: absolute;
  transform: translate(-50%, -50%);
  animation: snap-card-enter 320ms cubic-bezier(.2, .8, .2, 1) both;
}
.snap-card-inner {
  animation: snap-card-pulse 1.6s ease-in-out infinite;
  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.35))
          drop-shadow(0 0 18px rgba(252, 246, 230, 0.4));
}

.snap-chip {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 8px 16px;
  border-radius: 9999px;
  background: var(--color-coral);
  color: var(--color-cream-soft);
  border: 2px solid rgba(252, 246, 230, 0.92);
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  pointer-events: auto;
  cursor: pointer;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.3);
  animation: snap-chip-enter 280ms cubic-bezier(.2, .8, .2, 1) both;
  transition: transform 140ms ease, background-color 140ms ease;
}
.snap-chip:hover:not(:disabled) {
  background: var(--color-coral-deep);
  transform: translate(-50%, -50%) scale(1.06);
}
.snap-chip:active:not(:disabled) {
  transform: translate(-50%, -50%) scale(0.97);
}
.snap-chip.is-readonly {
  cursor: default;
}
.snap-chip.is-ai-pick {
  animation: snap-chip-enter 280ms cubic-bezier(.2, .8, .2, 1) both,
             snap-chip-ai-pulse 0.9s ease-in-out 280ms infinite;
  box-shadow:
    0 6px 14px rgba(0, 0, 0, 0.3),
    0 0 0 4px rgba(252, 246, 230, 0.55),
    0 0 24px 4px rgba(252, 246, 230, 0.4);
}

@keyframes snap-card-enter {
  0%   { transform: translate(-50%, -50%) scale(0.55) rotate(-12deg); opacity: 0; }
  60%  { transform: translate(-50%, -50%) scale(1.08) rotate(4deg); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1) rotate(0deg); opacity: 1; }
}
@keyframes snap-card-pulse {
  0%, 100% { transform: scale(1) translateY(0); }
  50%      { transform: scale(1.04) translateY(-3px); }
}
@keyframes snap-chip-enter {
  0%   { transform: translate(-50%, -50%) scale(0); opacity: 0; }
  100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
}
@keyframes snap-chip-ai-pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); }
  50%      { transform: translate(-50%, -50%) scale(1.12); }
}
</style>
