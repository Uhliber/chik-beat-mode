<script setup lang="ts">
import { computed, ref } from 'vue';
import type { GameEvent, ChantWord, BaseSlot, CardKind } from '@/game/types';
import IconTrophy from './icons/IconTrophy.vue';

const props = defineProps<{ events: GameEvent[] }>();

/** When true, the body is collapsed and only the header strip is visible. */
const collapsed = ref(false);

const formatted = computed(() =>
  props.events
    .slice()
    .reverse()
    .map((e, idx) => ({ id: idx, text: format(e), tone: tone(e) })),
);

function cardLabel(kind: CardKind | null, word: ChantWord): string {
  if (!kind) return cap(word);
  if (kind === 'reverse') return `Reverse ${cap(word)}`;
  if (kind === 'decoy') return `Decoy ${cap(word)}`;
  if (kind === 'halo-halo') return 'Halo-Halo Chik';
  return cap(word);
}

function baseLabel(slot: BaseSlot): string {
  return slot === 'main' ? 'Main base' : `${cap(slot)} base`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function format(e: GameEvent): string {
  switch (e.kind) {
    case 'setup':
      return `Setup: ${e.playerCount} players`;
    case 'dealt':
      return 'Cards dealt';
    case 'gameOpened':
      return `${e.openerId.toUpperCase()} opens with the Halo-Halo Chik`;
    case 'slam': {
      const card = cardLabel(e.cardKind, e.cardWord);
      return `${e.playerId.toUpperCase()} slams ${card} on the ${baseLabel(e.targetBase)}`;
    }
    case 'chantAdvanced':
      return `Chant: ${cap(e.from)} → ${cap(e.to)}`;
    case 'chantReversed':
      return `Reverse! Chant: ${cap(e.from)} → ${cap(e.to)}`;
    case 'tie': {
      const who = e.playerIds.map((p) => p.toUpperCase()).join(' & ');
      return `Tie on ${cap(e.beat)}: ${who} slammed at the same time`;
    }
    case 'miscall': {
      const card = cardLabel(e.cardKind, e.cardWord);
      const beat = cap(e.beat);
      const who = e.playerId.toUpperCase();
      switch (e.reason) {
        case 'wrong-word':
          return `${who} miscalled — shouted "${beat.toUpperCase()}" but slammed ${card} (needed a ${cap(e.beat)} card)`;
        case 'wrong-base':
          return `${who} miscalled — slammed ${card} on the ${baseLabel(e.targetBase)} instead of the ${baseLabel(e.cardWord)}`;
        case 'card-not-in-hand':
          return `${who} miscalled — tried to play a card that wasn't in their hand`;
        case 'out-of-turn':
          return `${who} miscalled — slammed during another player's beat`;
      }
      return `${who} miscalled on ${beat}`;
    }
    case 'penaltyTaken':
      return `${e.playerId.toUpperCase()} picks up ${e.cardIds.length} penalty card${e.cardIds.length === 1 ? '' : 's'}`;
    case 'beatChanged':
      return `${e.playerId.toUpperCase()}'s beat`;
    case 'beatSkipped':
      return `${e.playerId.toUpperCase()} skipped (no ${cap(e.beat)})`;
    case 'soloPenalty':
      return `${e.playerId.toUpperCase()} solo penalty — ${cap(e.cardWord)} on ${cap(e.expectedBeat)} beat (+${(e.penaltyMs / 1000).toFixed(1)} s)`;
    case 'soloAutoFinish':
      return `Stuck — auto-cleared ${e.cardCount} card${e.cardCount === 1 ? '' : 's'} (+${(e.totalPenaltyMs / 1000).toFixed(0)} s)`;
    case 'winner':
      return `${e.playerId.toUpperCase()} WINS`;
  }
}

function tone(e: GameEvent): 'info' | 'good' | 'bad' | 'win' | 'muted' {
  if (e.kind === 'tie' || e.kind === 'miscall' || e.kind === 'penaltyTaken' || e.kind === 'soloPenalty') return 'bad';
  if (e.kind === 'slam' || e.kind === 'gameOpened') return 'good';
  if (e.kind === 'winner') return 'win';
  if (e.kind === 'beatChanged' || e.kind === 'beatSkipped') return 'muted';
  return 'info';
}
</script>

<template>
  <div class="rounded-2xl bg-cream-soft/95 shadow-lg ring-1 ring-black/10 text-sm overflow-hidden flex flex-col">
    <!-- Header doubles as a click target — toggles the body open/closed. -->
    <header
      class="px-3 py-2 font-extrabold uppercase tracking-wider text-cream-soft flex items-center justify-between cursor-pointer select-none transition-colors"
      :style="{ background: 'var(--color-coral)' }"
      @click="collapsed = !collapsed"
    >
      <span>Event log</span>
      <button
        type="button"
        class="w-6 h-6 rounded-full flex items-center justify-center hover:bg-black/15 transition-colors"
        :aria-label="collapsed ? 'Expand event log' : 'Minimize event log'"
        @click.stop="collapsed = !collapsed"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          :style="{
            transition: 'transform 220ms ease-out',
            transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
          }"
        >
          <polyline points="3 7 6 4 9 7" />
        </svg>
      </button>
    </header>
    <!-- Body collapses with a subtle max-height + opacity animation. -->
    <div
      class="flex-1 overflow-y-auto divide-y divide-coral/10"
      :style="{
        maxHeight: collapsed ? '0px' : '60vh',
        opacity: collapsed ? 0 : 1,
        transition: 'max-height 280ms ease-out, opacity 200ms ease-out',
      }"
    >
      <div
        v-for="ev in formatted"
        :key="ev.id"
        class="px-3 py-1.5 text-xs leading-snug flex items-center gap-1.5"
        :class="{
          'text-stone-700': ev.tone === 'info',
          'text-emerald-700': ev.tone === 'good',
          'text-rose-700': ev.tone === 'bad',
          'text-amber-700 font-extrabold': ev.tone === 'win',
          'text-stone-400 italic': ev.tone === 'muted',
        }"
      >
        <IconTrophy v-if="ev.tone === 'win'" :size="14" class="shrink-0" />
        <span>{{ ev.text }}</span>
      </div>
      <div v-if="!events.length" class="p-3 text-stone-500 italic text-xs">
        No events yet — press Start.
      </div>
    </div>
  </div>
</template>
