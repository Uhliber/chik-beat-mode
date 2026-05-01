<script setup lang="ts">
import { computed } from 'vue';
import type { GameEvent, ChantWord, BaseSlot, CardKind } from '@/game/types';
import IconTrophy from './icons/IconTrophy.vue';

const props = defineProps<{ events: GameEvent[] }>();

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
    case 'winner':
      return `${e.playerId.toUpperCase()} WINS`;
  }
}

function tone(e: GameEvent): 'info' | 'good' | 'bad' | 'win' | 'muted' {
  if (e.kind === 'tie' || e.kind === 'miscall' || e.kind === 'penaltyTaken') return 'bad';
  if (e.kind === 'slam' || e.kind === 'gameOpened') return 'good';
  if (e.kind === 'winner') return 'win';
  if (e.kind === 'beatChanged' || e.kind === 'beatSkipped') return 'muted';
  return 'info';
}
</script>

<template>
  <div class="rounded-2xl bg-cream-soft/95 shadow-lg ring-1 ring-black/10 text-sm overflow-hidden flex flex-col">
    <header class="px-3 py-2 font-extrabold uppercase tracking-wider text-cream-soft" :style="{ background: 'var(--color-coral)' }">
      Event log
    </header>
    <div class="flex-1 overflow-y-auto max-h-[40vh] md:max-h-[60vh] divide-y divide-coral/10">
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
