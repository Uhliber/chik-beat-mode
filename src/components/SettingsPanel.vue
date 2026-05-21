<script setup lang="ts">
/**
 * The body of the settings UI — the same content rendered inside MobileBottomSheet on
 * mobile and SidePanel on desktop, and also inside the standalone /settings route.
 * Props mirror useGame's settable surface so the parent owns state and persistence;
 * this component is pure layout + emits.
 */
import { computed } from 'vue';
import SettingsGroup from './settings/SettingsGroup.vue';
import SettingsRow from './settings/SettingsRow.vue';
import SettingsToggle from './settings/SettingsToggle.vue';
import SettingsSegmented from './settings/SettingsSegmented.vue';
import IconVolume from './icons/IconVolume.vue';
import type { SimMode, AiSkillLevel } from '@/game/SimulationController';
import type { CardPrompt, PlaygroundComposition } from '@/game/types';
import type { PromptInfoSize, ChantRecitalSpeed } from '@/composables/userPreferences';
import { modeCaps } from '@/game/modes';

const props = defineProps<{
  mode: SimMode;
  audioMuted: boolean;
  wispEnabled: boolean;
  eventLogEnabled: boolean;
  guideOnTable: boolean;
  strictPrompts: boolean;
  aiSkill: AiSkillLevel;
  playerCount: number;
  speed: number;
  /** Playground deck composition (only relevant in mode === 'playground'). */
  playgroundComposition?: PlaygroundComposition;
  /** Playground starting hand size (only relevant in mode === 'playground'). */
  playgroundHandSize?: number;
  /** Hide the Game group rows when no round is in flight (e.g. from /settings). */
  hideGameSection?: boolean;
  /** Hide Restart / Back-to-menu (e.g. from /settings already on the menu). */
  hideRoundActions?: boolean;
  /** Hide the "How to play" action row (e.g. from /settings without an active game
   *  that can host the guide modal). */
  hideGuideAction?: boolean;
  promptSize?: 'small' | 'medium' | 'large' | 'xl';
  promptInfoSize?: PromptInfoSize;
  chantRecitalSpeed?: ChantRecitalSpeed;
  drawKeyEnabled?: boolean;
  appVersion?: string;
}>();

const emit = defineEmits<{
  (e: 'update:audio-muted', v: boolean): void;
  (e: 'update:wisp-enabled', v: boolean): void;
  (e: 'update:event-log-enabled', v: boolean): void;
  (e: 'update:guide-on-table', v: boolean): void;
  (e: 'show-guide'): void;
  (e: 'update:strict-prompts', v: boolean): void;
  (e: 'update:ai-skill', v: AiSkillLevel): void;
  (e: 'update:player-count', n: number): void;
  (e: 'update:speed', n: number): void;
  (e: 'update:playground-prompt-count', payload: { prompt: CardPrompt; count: number }): void;
  (e: 'update:playground-hand-size', n: number): void;
  (e: 'reset-playground-defaults'): void;
  (e: 'reset-general-defaults'): void;
  (e: 'update:prompt-size', v: 'small' | 'medium' | 'large' | 'xl'): void;
  (e: 'update:prompt-info-size', v: PromptInfoSize): void;
  (e: 'update:chant-recital-speed', v: ChantRecitalSpeed): void;
  (e: 'update:draw-key-enabled', v: boolean): void;
  (e: 'restart'): void;
  (e: 'back-to-menu'): void;
}>();

const speedOptions = [
  { label: '0.25×', value: 0.25 },
  { label: '0.5×',  value: 0.5  },
  { label: '1×',    value: 1    },
  { label: '2×',    value: 2    },
  { label: '4×',    value: 4    },
];
const playerOptions = [3, 4, 5, 6].map((n) => ({ label: String(n), value: n }));
const aiSkillOptions = [
  { label: 'Easy',   value: 1 },
  { label: 'Normal', value: 2 },
  { label: 'Hard',   value: 3 },
  { label: 'Master', value: 4 },
];
const promptSizeOptions = [
  { label: 'S',  value: 'small'  },
  { label: 'M',  value: 'medium' },
  { label: 'L',  value: 'large'  },
  { label: 'XL', value: 'xl'     },
];
const promptInfoSizeOptions = [
  { label: 'Off', value: 'off'    },
  { label: 'S',   value: 'small'  },
  { label: 'M',   value: 'medium' },
  { label: 'L',   value: 'large'  },
];
const chantRecitalSpeedOptions = [
  { label: 'Slow',   value: 'slow'   },
  { label: 'Normal', value: 'normal' },
  { label: 'Fast',   value: 'fast'   },
  { label: 'Skip',   value: 'skip'   },
];

const caps = computed(() => modeCaps(props.mode));
/** The "Game" group (players, speed, strict, AI skill) is meaningful for any
 *  turn-based mode. Today that's Versus + Playground, but a future turn-based mode
 *  picks up these settings automatically. */
const showVersusSettings = computed(() => caps.value.isTurnBased);

// Playground deck composition: each prompt picks from 0..6 × 7. Free has a 7 floor.
const promptCountOptions = [0, 7, 14, 21, 28, 35, 42].map((n) => ({ label: String(n), value: n }));
const promptCountOptionsFree = promptCountOptions.filter((o) => o.value >= 7);
const handSizeOptions = [3, 5, 7, 10, 14].map((n) => ({ label: String(n), value: n }));

const PROMPT_ROWS: { prompt: CardPrompt; label: string }[] = [
  { prompt: 'right', label: 'Right' },
  { prompt: 'left',  label: 'Left' },
  { prompt: 'free',  label: 'Free' },
  { prompt: 'stop',  label: 'Stop' },
  { prompt: 'snap',  label: 'Snap' },
  { prompt: 'fetch', label: 'Fetch' },
];

const deckTotal = computed(() => {
  const c = props.playgroundComposition;
  if (!c) return 0;
  return (c.right ?? 0) + (c.left ?? 0) + (c.free ?? 0) + (c.stop ?? 0) + (c.snap ?? 0) + (c.fetch ?? 0);
});
const dealtTotal = computed(() => (props.playgroundHandSize ?? 0) * props.playerCount);
const minDeckNeeded = computed(() => dealtTotal.value + 8);
const deckSufficient = computed(() => deckTotal.value >= minDeckNeeded.value);
</script>

<template>
  <div class="settings-panel">
    <SettingsGroup title="Sound">
      <SettingsRow>
        <template #icon><IconVolume :muted="audioMuted" :size="20" /></template>
        <template #label>Sound effects</template>
        <SettingsToggle
          :model-value="!audioMuted"
          aria-label="Sound effects"
          @update:model-value="(v) => emit('update:audio-muted', !v)"
        />
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup v-if="showVersusSettings && !hideGameSection" title="Game">
      <SettingsRow>
        <template #icon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="7" r="4" />
            <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
            <circle cx="17" cy="7" r="3" />
            <path d="M21 21v-2a3 3 0 0 0-2-2.83" />
          </svg>
        </template>
        <template #label>Players</template>
        <SettingsSegmented
          :model-value="playerCount"
          :options="playerOptions"
          @update:model-value="(v) => emit('update:player-count', Number(v))"
        />
      </SettingsRow>
      <SettingsRow>
        <template #icon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </template>
        <template #label>Speed</template>
        <SettingsSegmented
          :model-value="speed"
          :options="speedOptions"
          @update:model-value="(v) => emit('update:speed', Number(v))"
        />
      </SettingsRow>
      <SettingsRow description="Lets you attempt any play; wrong moves draw a penalty card.">
        <template #icon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </template>
        <template #label>Strict prompts</template>
        <SettingsToggle
          :model-value="strictPrompts"
          aria-label="Strict prompts"
          @update:model-value="(v) => emit('update:strict-prompts', v)"
        />
      </SettingsRow>
      <SettingsRow description="Higher levels strategise better and rarely make mistakes.">
        <template #icon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18h6" />
            <path d="M10 22h4" />
            <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
          </svg>
        </template>
        <template #label>AI skill</template>
        <SettingsSegmented
          :model-value="aiSkill"
          :options="aiSkillOptions"
          @update:model-value="(v) => emit('update:ai-skill', Number(v) as AiSkillLevel)"
        />
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup v-if="caps.hasCustomDeck && playgroundComposition && !hideGameSection" title="Playground deck">
      <SettingsRow description="Cards each player starts with (3 to 14).">
        <template #icon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="13" height="18" rx="2" />
            <path d="M8 9h6M8 13h4" />
          </svg>
        </template>
        <template #label>Hand size</template>
        <SettingsSegmented
          :model-value="playgroundHandSize ?? 7"
          :options="handSizeOptions"
          @update:model-value="(v) => emit('update:playground-hand-size', Number(v))"
        />
      </SettingsRow>

      <SettingsRow
        v-for="row in PROMPT_ROWS"
        :key="row.prompt"
        :description="row.prompt === 'free' ? 'Carries the Halo-Halo opener — minimum 7.' : undefined"
      >
        <template #label>{{ row.label }}</template>
        <SettingsSegmented
          :model-value="playgroundComposition[row.prompt] ?? 0"
          :options="row.prompt === 'free' ? promptCountOptionsFree : promptCountOptions"
          @update:model-value="(v) => emit('update:playground-prompt-count', { prompt: row.prompt, count: Number(v) })"
        />
      </SettingsRow>

      <SettingsRow>
        <template #label>Deck total</template>
        <span
          class="deck-summary"
          :class="{ 'is-short': !deckSufficient }"
        >
          {{ deckTotal }} · need ≥ {{ minDeckNeeded }}
        </span>
      </SettingsRow>

      <SettingsRow as-button @click="emit('reset-playground-defaults')">
        <template #icon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </template>
        <template #label>Reset to defaults</template>
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup title="Display">
      <SettingsRow v-if="showVersusSettings" description="Glowing wisp that follows whose turn it is.">
        <template #icon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" />
          </svg>
        </template>
        <template #label>Turn indicator</template>
        <SettingsToggle
          :model-value="wispEnabled"
          aria-label="Turn indicator"
          @update:model-value="(v) => emit('update:wisp-enabled', v)"
        />
      </SettingsRow>
      <SettingsRow description="Size of the active prompt card. XL crops to the upper half.">
        <template #icon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="9" x2="15" y2="9" />
          </svg>
        </template>
        <template #label>Prompt size</template>
        <SettingsSegmented
          :model-value="promptSize ?? 'medium'"
          :options="promptSizeOptions"
          aria-label="Prompt size"
          @update:model-value="(v) => emit('update:prompt-size', v as 'small' | 'medium' | 'large' | 'xl')"
        />
      </SettingsRow>
      <SettingsRow description="Floating prompt + count badge beside each player's active prompt. Off hides them.">
        <template #icon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </template>
        <template #label>Prompt info badge</template>
        <SettingsSegmented
          :model-value="promptInfoSize ?? 'medium'"
          :options="promptInfoSizeOptions"
          aria-label="Prompt info badge"
          @update:model-value="(v) => emit('update:prompt-info-size', v as PromptInfoSize)"
        />
      </SettingsRow>
      <SettingsRow description="Speed of the clockwise chant recital animation. Skip jumps straight to the result.">
        <template #icon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="5 4 15 12 5 20 5 4" />
            <line x1="19" y1="5" x2="19" y2="19" />
          </svg>
        </template>
        <template #label>Chant recital</template>
        <SettingsSegmented
          :model-value="chantRecitalSpeed ?? 'normal'"
          :options="chantRecitalSpeedOptions"
          aria-label="Chant recital speed"
          @update:model-value="(v) => emit('update:chant-recital-speed', v as ChantRecitalSpeed)"
        />
      </SettingsRow>
      <SettingsRow description="Press D to draw from the deck instead of clicking it.">
        <template #icon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M9 9h6M9 13h4" />
          </svg>
        </template>
        <template #label>Draw shortcut (D)</template>
        <SettingsToggle
          :model-value="drawKeyEnabled ?? true"
          aria-label="Draw shortcut"
          @update:model-value="(v) => emit('update:draw-key-enabled', v)"
        />
      </SettingsRow>
      <SettingsRow description="Show the running event log (desktop sidebar / mobile sheet).">
        <template #icon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        </template>
        <template #label>Event log</template>
        <SettingsToggle
          :model-value="eventLogEnabled"
          aria-label="Event log"
          @update:model-value="(v) => emit('update:event-log-enabled', v)"
        />
      </SettingsRow>
      <SettingsRow description="Show the How-to-Play card floating on the table. Off keeps the table clean — open the guide from the row below instead.">
        <template #icon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </template>
        <template #label>Guide on table</template>
        <SettingsToggle
          :model-value="guideOnTable"
          aria-label="Guide on table"
          @update:model-value="(v) => emit('update:guide-on-table', v)"
        />
      </SettingsRow>
      <SettingsRow v-if="!hideGuideAction" as-button @click="emit('show-guide')">
        <template #icon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </template>
        <template #label>How to play</template>
      </SettingsRow>
      <SettingsRow
        as-button
        description="Restores Sound, Game, and Display to defaults. Playground deck has its own reset above."
        @click="emit('reset-general-defaults')"
      >
        <template #icon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </template>
        <template #label>Reset to defaults</template>
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup v-if="!hideRoundActions" title="Round">
      <SettingsRow as-button @click="emit('restart')">
        <template #icon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </template>
        <template #label>Restart round</template>
      </SettingsRow>
      <SettingsRow as-button @click="emit('back-to-menu')">
        <template #icon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </template>
        <template #label>Back to menu</template>
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup title="About">
      <SettingsRow>
        <template #icon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </template>
        <template #label>Version</template>
        <span class="version-tag">{{ appVersion ?? 'v1.0' }}</span>
      </SettingsRow>
    </SettingsGroup>
  </div>
</template>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 8px 0;
}
.version-tag {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 13px;
  color: rgb(120, 113, 108);
}
.deck-summary {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 13px;
  color: rgb(120, 113, 108);
}
.deck-summary.is-short {
  color: var(--color-coral-deep);
  font-weight: 700;
}
</style>
