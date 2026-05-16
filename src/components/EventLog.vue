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
    case 'versusSnapDrawnAvailable': return `${e.playerId} drew a Snap matching the beat`;
    case 'versusSnapDrawnPlayed': return `${e.playerId} snap-played a drawn card`;
    case 'versusSnapDrawnKept': return `${e.playerId} kept the drawn Snap`;
    case 'versusStrictPenalty': return `${e.playerId} penalty (${e.reason})`;
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
  <div class="event-log-scroll rounded-lg bg-stone-900/70 backdrop-blur-sm ring-1 ring-cream-soft/15 p-3 text-cream-soft/90 max-h-72 overflow-y-auto">
    <div class="font-extrabold uppercase tracking-widest text-[10px] mb-2 text-cream-soft/70">
      Event Log
    </div>
    <ul class="flex flex-col gap-1 text-xs">
      <li v-for="(e, i) in recent" :key="i" class="font-mono">{{ describe(e) }}</li>
      <li v-if="recent.length === 0" class="text-cream-soft/50 italic">No events yet.</li>
    </ul>
  </div>
</template>

<style scoped>
/**
 * Theme the scrollbar so it doesn't surface as the OS default (typically a bright
 * white/light bar) against the log's dark bg. Cream at low alpha matches the body
 * text colour; track stays transparent so the log's translucent stone background
 * shows through. Firefox + WebKit covered.
 */
.event-log-scroll {
  scrollbar-color: rgba(252, 246, 230, 0.22) transparent;
  scrollbar-width: thin;
}
.event-log-scroll::-webkit-scrollbar {
  width: 6px;
}
.event-log-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.event-log-scroll::-webkit-scrollbar-thumb {
  background: rgba(252, 246, 230, 0.22);
  border-radius: 3px;
}
.event-log-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(252, 246, 230, 0.38);
}
</style>
