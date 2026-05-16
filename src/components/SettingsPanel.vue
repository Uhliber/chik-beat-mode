<script setup lang="ts">
/**
 * The body of the settings UI — the same content rendered inside MobileBottomSheet on
 * mobile and SidePanel on desktop, and also inside the standalone /settings route.
 * Props mirror useGame's settable surface so the parent owns state and persistence;
 * this component is pure layout + emits.
 */
import SettingsGroup from './settings/SettingsGroup.vue';
import SettingsRow from './settings/SettingsRow.vue';
import SettingsToggle from './settings/SettingsToggle.vue';
import SettingsSegmented from './settings/SettingsSegmented.vue';
import IconVolume from './icons/IconVolume.vue';
import type { SimMode, AiSkillLevel } from '@/game/SimulationController';

defineProps<{
  mode: SimMode;
  audioMuted: boolean;
  wispEnabled: boolean;
  strictPrompts: boolean;
  aiSkill: AiSkillLevel;
  playerCount: number;
  speed: number;
  /** Hide the Game group rows when no round is in flight (e.g. from /settings). */
  hideGameSection?: boolean;
  /** Hide Restart / Back-to-menu (e.g. from /settings already on the menu). */
  hideRoundActions?: boolean;
  appVersion?: string;
}>();

const emit = defineEmits<{
  (e: 'update:audio-muted', v: boolean): void;
  (e: 'update:wisp-enabled', v: boolean): void;
  (e: 'update:strict-prompts', v: boolean): void;
  (e: 'update:ai-skill', v: AiSkillLevel): void;
  (e: 'update:player-count', n: number): void;
  (e: 'update:speed', n: number): void;
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

    <SettingsGroup v-if="mode === 'versus' && !hideGameSection" title="Game">
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

    <SettingsGroup v-if="mode === 'versus'" title="Display">
      <SettingsRow description="Glowing wisp that follows whose turn it is.">
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
</style>
