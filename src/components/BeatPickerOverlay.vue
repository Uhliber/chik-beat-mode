<script setup lang="ts">
/**
 * Beat-selection setup overlay. After dealing, each player picks a Beat Card clockwise
 * from the Halo-Halo holder (3p picks twice). The 6 Beat Cards float in the center; the
 * current picker's available choices are interactive. The overlay vanishes once setup
 * is complete (`setupPhase` flips to 'play').
 *
 * Beat ownership doesn't pin to specific seat positions — the overlay just renders the
 * six chant words. Each player picks one (or two in 3p) and the dot row on their seat
 * shows what they took.
 */
import { computed } from 'vue';
import type { ChantWord } from '@/game/types';
import { CHANT_ORDER } from '@/game/types';

const props = defineProps<{
  visible: boolean;
  /** Map of chant word → seat index that owns the Beat Card. -1 = unclaimed. */
  beatOwners: Map<ChantWord, number>;
  /** Player IDs by seat index — used to label the owner-pill on claimed beats. */
  playerLabels: string[];
  /** Player.isAI flags by seat index. */
  playerAi: boolean[];
  /** Seat index whose pick is currently up. -1 / null = none (overlay can vanish). */
  currentPickerSeat: number | null;
  /** True when the currentPickerSeat is the human — chips are clickable. */
  interactive: boolean;
}>();

const emit = defineEmits<{
  (e: 'pick', beat: ChantWord): void;
}>();

const beats = CHANT_ORDER;

const ownerByBeat = computed(() => {
  const out = new Map<ChantWord, { seat: number; label: string } | null>();
  for (const w of beats) {
    const seat = props.beatOwners.get(w) ?? -1;
    if (seat < 0) {
      out.set(w, null);
    } else {
      out.set(w, { seat, label: props.playerLabels[seat]?.toUpperCase() ?? `P${seat + 1}` });
    }
  }
  return out;
});

const pickerLabel = computed(() => {
  const s = props.currentPickerSeat;
  if (s == null || s < 0) return '';
  const lbl = props.playerLabels[s]?.toUpperCase() ?? `P${s + 1}`;
  return props.playerAi[s] ? `${lbl} is picking…` : `${lbl}, pick your beat`;
});
</script>

<template>
  <Transition
    enter-from-class="opacity-0"
    enter-active-class="transition duration-200"
    leave-active-class="transition duration-200"
    leave-to-class="opacity-0"
  >
    <div v-if="visible" class="beat-picker-overlay" role="dialog" aria-label="Choose your beat">
      <div class="beat-picker-backdrop" />
      <div class="beat-picker-panel">
        <div class="beat-picker-title">Claim a Beat</div>
        <div class="beat-picker-sub">{{ pickerLabel }}</div>
        <div class="beat-grid">
          <button
            v-for="beat in beats"
            :key="beat"
            type="button"
            :class="['beat-card', `word-${beat}`, {
              'is-claimed': ownerByBeat.get(beat) !== null,
              'is-clickable': interactive && ownerByBeat.get(beat) === null,
            }]"
            :disabled="!interactive || ownerByBeat.get(beat) !== null"
            @click="interactive && ownerByBeat.get(beat) === null && emit('pick', beat)"
          >
            <span class="beat-card-word">{{ beat.toUpperCase() }}</span>
            <span v-if="ownerByBeat.get(beat)" class="beat-card-owner">
              {{ ownerByBeat.get(beat)?.label }}
            </span>
          </button>
        </div>
        <div class="beat-picker-hint">
          Beat owners win the Chant Power when the chant lands on their beat.
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.beat-picker-overlay {
  position: absolute;
  inset: 0;
  z-index: 45;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.beat-picker-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(20, 14, 10, 0.55);
  backdrop-filter: blur(2px);
}
.beat-picker-panel {
  position: relative;
  background: var(--color-cream-soft);
  border-radius: 18px;
  padding: 18px 22px 16px;
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.45);
  max-width: 520px;
  width: 100%;
  text-align: center;
}
.beat-picker-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.8rem;
  color: var(--color-coral-deep);
  letter-spacing: 0.04em;
  line-height: 1.1;
}
.beat-picker-sub {
  margin-top: 4px;
  font-family: var(--font-subtitle);
  font-size: 0.95rem;
  color: #2a1d12;
  letter-spacing: 0.04em;
}
.beat-grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 480px) {
  .beat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.beat-card {
  position: relative;
  padding: 18px 8px;
  border-radius: 12px;
  border: 3px solid var(--word-color, var(--color-coral));
  background: var(--word-muted, var(--color-cream));
  color: #2a1d12;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.2rem;
  letter-spacing: 0.06em;
  cursor: not-allowed;
  transition: transform 160ms cubic-bezier(.2, .8, .2, 1), box-shadow 160ms ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.beat-card.is-clickable {
  cursor: pointer;
  background: var(--color-cream-soft);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.18);
}
.beat-card.is-clickable:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.24);
}
.beat-card.is-claimed {
  opacity: 0.6;
  filter: grayscale(0.2);
}
.beat-card-word {
  color: var(--word-color, var(--color-coral));
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.05);
}
.beat-card-owner {
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  padding: 2px 8px;
  border-radius: 9999px;
  background: var(--word-color, var(--color-coral));
  color: var(--color-cream-soft);
}
.beat-picker-hint {
  margin-top: 10px;
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 0.78rem;
  color: rgba(42, 29, 18, 0.7);
  letter-spacing: 0.02em;
}
</style>
