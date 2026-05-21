<script setup lang="ts">
/**
 * Chant Power give-cards modal for the human winner. Pick up to 3 cards from your
 * hand, then for each picked card choose a recipient seat. Confirm → engine moves the
 * cards and resumes play.
 *
 * Steps:
 *  1. tap up to 3 cards (a fourth tap unselects the oldest)
 *  2. tap each selected card to cycle through opponent recipients
 *  3. tap Confirm
 */
import { computed, ref, watch } from 'vue';
import CardView from './CardView.vue';
import type { Card } from '@/game/Card';
import type { ChantPowerGift } from '@/game/types';

const props = defineProps<{
  visible: boolean;
  hand: Card[];
  /** Seat indices the winner may give to (all non-self seats). */
  recipientSeats: number[];
  /** Player labels by seat index. */
  playerLabels: string[];
}>();

const emit = defineEmits<{
  (e: 'resolve', gifts: ChantPowerGift[]): void;
  (e: 'skip'): void;
}>();

/** Selected card id + cycling recipient seat (index into recipientSeats). Reset when
 *  the modal opens/closes. */
interface Pick {
  cardId: string;
  recipientSeatIndex: number;
}
const picks = ref<Pick[]>([]);

watch(
  () => props.visible,
  (v) => {
    if (v) picks.value = [];
  },
);

const handById = computed(() => {
  const m = new Map<string, Card>();
  for (const c of props.hand) m.set(c.id, c);
  return m;
});

function toggleCard(card: Card) {
  const idx = picks.value.findIndex((p) => p.cardId === card.id);
  if (idx >= 0) {
    // Tap an already-selected card to cycle its recipient through the list. If it's
    // on the last recipient, the next tap removes the selection.
    const current = picks.value[idx];
    const next = current.recipientSeatIndex + 1;
    if (next >= props.recipientSeats.length) {
      picks.value.splice(idx, 1);
    } else {
      picks.value[idx] = { ...current, recipientSeatIndex: next };
    }
    return;
  }
  if (picks.value.length >= 3) {
    // Drop the oldest pick to make room.
    picks.value.shift();
  }
  picks.value.push({ cardId: card.id, recipientSeatIndex: 0 });
}

function selectionMeta(cardId: string) {
  const idx = picks.value.findIndex((p) => p.cardId === cardId);
  if (idx < 0) return null;
  const seatIdx = props.recipientSeats[picks.value[idx].recipientSeatIndex];
  return {
    order: idx + 1,
    seatIndex: seatIdx,
    label: props.playerLabels[seatIdx]?.toUpperCase() ?? `P${seatIdx + 1}`,
  };
}

function confirm() {
  if (picks.value.length === 0) {
    // Per rulebook: the winner MUST give up to 3, but giving 0 is implicitly allowed
    // when they want to keep their hand. Surface both paths.
    emit('resolve', []);
    return;
  }
  // Group picks by recipient.
  const grouped = new Map<number, string[]>();
  for (const p of picks.value) {
    const seat = props.recipientSeats[p.recipientSeatIndex];
    if (!grouped.has(seat)) grouped.set(seat, []);
    grouped.get(seat)!.push(p.cardId);
  }
  const gifts: ChantPowerGift[] = [];
  for (const [seat, cardIds] of grouped) {
    gifts.push({ recipientSeatIndex: seat, cardIds });
  }
  emit('resolve', gifts);
}
</script>

<template>
  <Transition
    enter-from-class="opacity-0"
    enter-active-class="transition duration-220"
    leave-active-class="transition duration-220"
    leave-to-class="opacity-0"
  >
    <div v-if="visible" class="cp-modal" role="dialog" aria-label="Chant Power: give cards">
      <div class="cp-backdrop" />
      <div class="cp-panel">
        <div class="cp-title">You won the Chant Power!</div>
        <div class="cp-sub">Choose up to 3 cards to give away. Tap a card to select it; tap again to cycle its recipient.</div>

        <div class="cp-hand">
          <button
            v-for="card in hand"
            :key="card.id"
            type="button"
            class="cp-card"
            :class="{ 'is-selected': selectionMeta(card.id) !== null }"
            @click="toggleCard(card)"
          >
            <CardView :card="card" :face-up="true" :width="58" :static-flip="true" />
            <div v-if="selectionMeta(card.id)" class="cp-card-tag">
              <span class="cp-card-tag-order">#{{ selectionMeta(card.id)!.order }}</span>
              <span class="cp-card-tag-arrow">→</span>
              <span class="cp-card-tag-recipient">{{ selectionMeta(card.id)!.label }}</span>
            </div>
          </button>
        </div>

        <div class="cp-actions">
          <button type="button" class="cp-confirm" @click="confirm">
            {{ picks.length === 0 ? 'Keep all cards' : `Give ${picks.length} card${picks.length === 1 ? '' : 's'}` }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/**
 * Bottom-anchored overlay (not a full-screen modal). Sits above the human's hand
 * area so the rest of the table — opponents, prompts, hand sizes — remains fully
 * visible. The user can read who has what before deciding where to send cards.
 */
.cp-modal {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  display: flex;
  justify-content: center;
  padding: 0 16px max(16px, env(safe-area-inset-bottom, 0px));
  pointer-events: none;
}
/* No backdrop. The previous modal used a full opaque-ish overlay; the user explicitly
 * wanted the table visible so they can strategize about recipients. */
.cp-backdrop {
  display: none;
}
.cp-panel {
  position: relative;
  background: var(--color-cream-soft);
  border-radius: 22px 22px 14px 14px;
  padding: 14px 22px 16px;
  box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.45),
              0 0 0 2px rgba(231, 89, 61, 0.55);
  max-width: 760px;
  width: 100%;
  text-align: center;
  pointer-events: auto;
  animation: cp-slide-up 320ms cubic-bezier(.2, .8, .2, 1) both;
}
@keyframes cp-slide-up {
  from { opacity: 0; transform: translateY(28px); }
  to   { opacity: 1; transform: translateY(0); }
}
.cp-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.35rem;
  color: var(--color-coral-deep);
  line-height: 1.1;
  letter-spacing: 0.03em;
}
.cp-sub {
  margin-top: 4px;
  font-family: var(--font-body);
  font-size: 0.78rem;
  color: rgba(42, 29, 18, 0.78);
}
.cp-hand {
  margin-top: 12px;
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  justify-content: center;
  overflow-x: auto;
  padding: 4px 2px 12px;
}
.cp-card {
  position: relative;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  border-radius: 10px;
  transition: transform 140ms cubic-bezier(.2, .8, .2, 1), filter 140ms ease;
}
.cp-card:hover { transform: translateY(-3px); }
.cp-card.is-selected {
  transform: translateY(-6px) scale(1.04);
  filter: drop-shadow(0 6px 14px rgba(231, 89, 61, 0.45));
}
.cp-card-tag {
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 9999px;
  background: var(--color-coral);
  color: var(--color-cream-soft);
  font-family: var(--font-body);
  font-weight: 800;
  font-size: 11px;
  letter-spacing: 0.04em;
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
}
.cp-card-tag-order { opacity: 0.85; }
.cp-card-tag-arrow { opacity: 0.7; }
.cp-card-tag-recipient { letter-spacing: 0.08em; }

.cp-actions {
  margin-top: 8px;
  display: flex;
  justify-content: center;
}
.cp-confirm {
  padding: 8px 24px;
  border-radius: 9999px;
  background: var(--color-coral-deep);
  color: var(--color-cream-soft);
  border: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: 0.06em;
  cursor: pointer;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.35);
  transition: transform 140ms cubic-bezier(.2, .8, .2, 1), box-shadow 140ms ease;
}
.cp-confirm:hover {
  transform: scale(1.04);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.42);
}
.cp-confirm:active { transform: scale(0.97); }
</style>
