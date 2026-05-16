<script setup lang="ts">
import { computed } from 'vue';
import type { GameEvent } from '@/game/types';

const props = defineProps<{
  events: GameEvent[];
}>();

const recent = computed(() => props.events.slice(-12).reverse());

function describe(e: GameEvent): string {
  switch (e.kind) {
    case 'setup':           return `Setup · ${e.mode} · ${e.playerCount}p`;
    case 'dealt':           return 'Cards dealt';
    case 'gameOpened':      return `${e.openerId} opened the game`;
    case 'soloSlam':        return `Slam ${e.cardWord} → ${e.baseSide}`;
    case 'soloDraw':        return 'Drew a card';
    case 'soloPenalty':     return `Penalty: ${e.reason} (+${e.penaltyMs / 1000}s)`;
    case 'versusPlay':      return `${e.playerId} played ${e.cardPrompt} ${e.cardWord} → seat ${e.targetSeatIndex}`;
    case 'versusDraw':      return e.cardId ? `${e.playerId} drew from ${e.from}` : `${e.playerId} pass (empty pile)`;
    case 'versusSnapDrawnPlayed': return `${e.playerId} snap-played a drawn card`;
    case 'versusTurnChanged': return `Turn → ${e.playerId}${e.viaChain ? ' (chain)' : ''}`;
    case 'versusChainStarted': return `Chain: seat ${e.sourceSeatIndex} bounces back`;
    case 'versusChainEnded':   return `Chain ended (${e.reason})`;
    case 'versusStopConverted': return 'Draw pile empty — Stops convert to Left/Right';
    case 'chantAdvanced':   return `Chant: ${e.from} → ${e.to}`;
    case 'winner':          return `Winner: ${e.playerId}`;
  }
}
</script>

<template>
  <div class="rounded-lg bg-stone-900/70 backdrop-blur-sm ring-1 ring-cream-soft/15 p-3 text-cream-soft/90 max-h-72 overflow-y-auto">
    <div class="font-extrabold uppercase tracking-widest text-[10px] mb-2 text-cream-soft/70">
      Event Log
    </div>
    <ul class="flex flex-col gap-1 text-xs">
      <li v-for="(e, i) in recent" :key="i" class="font-mono">{{ describe(e) }}</li>
      <li v-if="recent.length === 0" class="text-cream-soft/50 italic">No events yet.</li>
    </ul>
  </div>
</template>
