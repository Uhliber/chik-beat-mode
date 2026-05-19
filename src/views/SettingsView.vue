<script setup lang="ts">
/**
 * Standalone settings route reached from the main menu. Renders the same SettingsPanel
 * used in-game so there's a single source of truth for what "settings" looks like.
 *
 * We don't have an active game here, so player count / speed / restart / back-to-menu
 * are hidden — only Audio, Display (turn indicator), and About remain meaningful.
 *
 * IMPORTANT: every preference read, write, and DEFAULT here goes through
 * `composables/userPreferences`. That module is the same one `useGame` uses, so the
 * standalone view and the in-game settings panel can never disagree on storage keys
 * or default values — including for "Reset to defaults".
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import SettingsPanel from '@/components/SettingsPanel.vue';
import { useBeatAudio } from '@/composables/useBeatAudio';
import type { AiSkillLevel } from '@/game/SimulationController';
import {
  DEFAULT_AI_SKILL,
  DEFAULT_AUDIO_MUTED,
  DEFAULT_EVENT_LOG_ENABLED,
  DEFAULT_PROMPT_SIZE,
  DEFAULT_STRICT_PROMPTS,
  DEFAULT_WISP_ENABLED,
  type PromptSize,
  clearGuideOnTable,
  loadAiSkill,
  loadEventLogEnabled,
  loadGuideOnTable,
  loadPromptSize,
  loadStrictPrompts,
  loadWispEnabled,
  saveAiSkill,
  saveEventLogEnabled,
  saveGuideOnTable,
  savePromptSize,
  saveStrictPrompts,
  saveWispEnabled,
} from '@/composables/userPreferences';

const router = useRouter();
const { audioMuted, setMuted } = useBeatAudio();

const wispEnabled = ref(DEFAULT_WISP_ENABLED);
const eventLogEnabled = ref(DEFAULT_EVENT_LOG_ENABLED);
/** Tri-state mirror of the persisted preference. `null` = "no explicit pref set" — the
 *  view-layer `guideOnTable` computed below resolves it to the platform-aware default
 *  (desktop on, mobile off), so a reset behaves identically here and in the in-game
 *  settings panel. */
const guideOnTablePref = ref<boolean | null>(null);
const strictPrompts = ref(DEFAULT_STRICT_PROMPTS);
const aiSkill = ref<AiSkillLevel>(DEFAULT_AI_SKILL);
const promptSize = ref<PromptSize>(DEFAULT_PROMPT_SIZE);

const isMobile = computed(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
const guideOnTable = computed(() => guideOnTablePref.value ?? !isMobile.value);

void loadWispEnabled().then((v) => { wispEnabled.value = v; });
void loadEventLogEnabled().then((v) => { eventLogEnabled.value = v; });
void loadGuideOnTable().then((v) => { guideOnTablePref.value = v; });
void loadStrictPrompts().then((v) => { strictPrompts.value = v; });
void loadAiSkill().then((v) => { aiSkill.value = v; });
void loadPromptSize().then((v) => { promptSize.value = v; });

function setWispEnabled(v: boolean) { wispEnabled.value = v; saveWispEnabled(v); }
function setEventLogEnabled(v: boolean) { eventLogEnabled.value = v; saveEventLogEnabled(v); }
function setGuideOnTable(v: boolean) { guideOnTablePref.value = v; saveGuideOnTable(v); }
function setStrictPrompts(v: boolean) { strictPrompts.value = v; saveStrictPrompts(v); }
function setAiSkill(v: AiSkillLevel) { aiSkill.value = v; saveAiSkill(v); }
function setPromptSize(v: PromptSize) { promptSize.value = v; savePromptSize(v); }

/** Restore Sound + Game + Display to canonical defaults. Uses the same DEFAULT_*
 *  constants as `useGame`'s reset, so menu-reset and in-game-reset can't drift.
 *  Player count / speed are excluded (not adjustable from this view; their Game group
 *  is hidden when no round is in flight). Playground deck keeps its own reset. */
function resetGeneralDefaults() {
  setMuted(DEFAULT_AUDIO_MUTED);
  setWispEnabled(DEFAULT_WISP_ENABLED);
  setEventLogEnabled(DEFAULT_EVENT_LOG_ENABLED);
  setStrictPrompts(DEFAULT_STRICT_PROMPTS);
  setAiSkill(DEFAULT_AI_SKILL);
  setPromptSize(DEFAULT_PROMPT_SIZE);
  // Guide-on-table: clear the explicit pref so it follows the platform default again
  // (matches the in-game reset's `null` behaviour exactly).
  guideOnTablePref.value = null;
  clearGuideOnTable();
}

function back() {
  if (window.history.length > 1) router.back();
  else router.replace({ name: 'menu' });
}
</script>

<template>
  <div
    class="fixed inset-0 flex flex-col"
    style="background: var(--color-cream); height: 100dvh;"
  >
    <header class="flex items-center gap-2 px-3 py-3">
      <button
        type="button"
        aria-label="Back"
        class="w-10 h-10 rounded-full bg-cream-soft ring-1 ring-black/10 flex items-center justify-center text-coral-deep"
        @click="back"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <h1 class="font-display text-coral-deep tracking-tight leading-none uppercase text-2xl">
        Settings
      </h1>
    </header>

    <main class="flex-1 px-4 pb-6 overflow-auto">
      <SettingsPanel
        mode="versus"
        :audio-muted="audioMuted"
        :wisp-enabled="wispEnabled"
        :event-log-enabled="eventLogEnabled"
        :guide-on-table="guideOnTable"
        :strict-prompts="strictPrompts"
        :ai-skill="aiSkill"
        :player-count="4"
        :speed="1"
        :prompt-size="promptSize"
        hide-game-section
        hide-round-actions
        hide-guide-action
        @update:audio-muted="setMuted"
        @update:wisp-enabled="setWispEnabled"
        @update:event-log-enabled="setEventLogEnabled"
        @update:guide-on-table="setGuideOnTable"
        @update:prompt-size="setPromptSize"
        @update:strict-prompts="setStrictPrompts"
        @update:ai-skill="setAiSkill"
        @update:player-count="() => undefined"
        @update:speed="() => undefined"
        @reset-general-defaults="resetGeneralDefaults"
        @restart="() => undefined"
        @back-to-menu="back"
      />
    </main>
  </div>
</template>
