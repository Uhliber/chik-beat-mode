/**
 * Single source of truth for every user-adjustable preference in the app:
 * the Capacitor `Preferences` keys, the canonical default values, and the
 * `load*` / `save*` helpers that read & write them.
 *
 * Both `useGame` (in-game settings panel) and `SettingsView` (standalone
 * /settings route reached from the main menu) import from here so the two
 * surfaces can never drift on defaults or storage keys. Crucially, the
 * "Reset to defaults" actions in either surface end up resetting the same
 * values — without this shared module they were silently diverging
 * (different guide-on-table behaviour on mobile, missing player-count /
 * speed resets from the menu, etc.).
 */

import { Preferences } from '@capacitor/preferences';
import type { AiSkillLevel } from '@/game/SimulationController';
import type { PlaygroundComposition } from '@/game/types';

/* ============ Visible-size preset for the active prompt card ============ */
export type PromptSize = 'small' | 'medium' | 'large' | 'xl';
const PROMPT_SIZE_VALUES: readonly PromptSize[] = ['small', 'medium', 'large', 'xl'] as const;

/* ===== Floating prompt+count info popover (off / small / medium / large) ===== */
export type PromptInfoSize = 'off' | 'small' | 'medium' | 'large';
const PROMPT_INFO_SIZE_VALUES: readonly PromptInfoSize[] = ['off', 'small', 'medium', 'large'] as const;

/* ====================== Capacitor Preferences keys ====================== */
export const PREF_KEYS = {
  soloBestTime: 'chik-solo-best-time-ms',
  wispEnabled: 'chik-wisp-enabled',
  strictPrompts: 'chik-strict-prompts',
  aiSkill: 'chik-ai-skill',
  playgroundComposition: 'chik-playground-composition',
  playgroundHandSize: 'chik-playground-hand-size',
  promptSize: 'chik-prompt-size',
  promptInfoSize: 'chik-prompt-info-size',
  eventLogEnabled: 'chik-event-log-enabled',
  guideOnTable: 'chik-guide-on-table',
  skipChantRecital: 'chik-skip-chant-recital',
} as const;

/* ===== Canonical defaults — used at load-time AND by "Reset to defaults" ===== */

/** Audio mute is not persisted (lives in the useBeatAudio singleton) — included
 *  here only so a reset has one canonical value to write through `setMuted`. */
export const DEFAULT_AUDIO_MUTED = false;
export const DEFAULT_WISP_ENABLED = true;
export const DEFAULT_EVENT_LOG_ENABLED = true;
/** `null` = "no explicit preference"; the consumer falls back to a platform-aware
 *  default (desktop on, mobile off). */
export const DEFAULT_GUIDE_ON_TABLE_PREF: boolean | null = null;
export const DEFAULT_STRICT_PROMPTS = false;
export const DEFAULT_AI_SKILL: AiSkillLevel = 3;
export const DEFAULT_PROMPT_SIZE: PromptSize = 'medium';
export const DEFAULT_PROMPT_INFO_SIZE: PromptInfoSize = 'medium';
export const DEFAULT_SKIP_CHANT_RECITAL = false;
export const DEFAULT_SPEED = 1;
/** Versus / Playground default seat count. Solo is locked to 1 by setMode. */
export const DEFAULT_PLAYER_COUNT_TURN_BASED = 4;
export const DEFAULT_PLAYGROUND_COMPOSITION: PlaygroundComposition = {
  right: 14, left: 14, free: 7, stop: 7, snap: 7, fetch: 7,
};
export const DEFAULT_PLAYGROUND_HAND_SIZE = 7;

/* ============================== Helpers ============================== */

async function readBool(key: string, fallback: boolean): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key });
    if (value === null || value === undefined) return fallback;
    return value === '1' || value === 'true';
  } catch {
    return fallback;
  }
}

function writeBool(key: string, on: boolean): void {
  void Preferences.set({ key, value: on ? '1' : '0' }).catch(() => undefined);
}

/* ============================ Solo best time ============================ */
export async function loadSoloBestTime(): Promise<number | null> {
  try {
    const { value } = await Preferences.get({ key: PREF_KEYS.soloBestTime });
    if (!value) return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
export function saveSoloBestTime(ms: number): void {
  void Preferences.set({ key: PREF_KEYS.soloBestTime, value: String(Math.round(ms)) }).catch(() => undefined);
}

/* =============================== Wisp =============================== */
export const loadWispEnabled = () => readBool(PREF_KEYS.wispEnabled, DEFAULT_WISP_ENABLED);
export const saveWispEnabled = (on: boolean) => writeBool(PREF_KEYS.wispEnabled, on);

/* ============================ Event log ============================ */
export const loadEventLogEnabled = () => readBool(PREF_KEYS.eventLogEnabled, DEFAULT_EVENT_LOG_ENABLED);
export const saveEventLogEnabled = (on: boolean) => writeBool(PREF_KEYS.eventLogEnabled, on);

/* ========================== Guide-on-table ========================== */
/** Tri-state: explicitly true, explicitly false, or `null` (no preference set —
 *  the consumer should fall back to a platform-aware default). */
export async function loadGuideOnTable(): Promise<boolean | null> {
  try {
    const { value } = await Preferences.get({ key: PREF_KEYS.guideOnTable });
    if (value === null || value === undefined) return null;
    return value === '1' || value === 'true';
  } catch {
    return null;
  }
}
export const saveGuideOnTable = (on: boolean) => writeBool(PREF_KEYS.guideOnTable, on);
export function clearGuideOnTable(): void {
  void Preferences.remove({ key: PREF_KEYS.guideOnTable }).catch(() => undefined);
}

/* =========================== Strict prompts =========================== */
export const loadStrictPrompts = () => readBool(PREF_KEYS.strictPrompts, DEFAULT_STRICT_PROMPTS);
export const saveStrictPrompts = (on: boolean) => writeBool(PREF_KEYS.strictPrompts, on);

/* =============================== AI skill =============================== */
export async function loadAiSkill(): Promise<AiSkillLevel> {
  try {
    const { value } = await Preferences.get({ key: PREF_KEYS.aiSkill });
    const n = Number(value);
    if (n === 1 || n === 2 || n === 3 || n === 4) return n;
    return DEFAULT_AI_SKILL;
  } catch {
    return DEFAULT_AI_SKILL;
  }
}
export function saveAiSkill(level: AiSkillLevel): void {
  void Preferences.set({ key: PREF_KEYS.aiSkill, value: String(level) }).catch(() => undefined);
}

/* ============================ Prompt size ============================ */
export async function loadPromptSize(): Promise<PromptSize> {
  try {
    const { value } = await Preferences.get({ key: PREF_KEYS.promptSize });
    if (value && (PROMPT_SIZE_VALUES as readonly string[]).includes(value)) {
      return value as PromptSize;
    }
    return DEFAULT_PROMPT_SIZE;
  } catch {
    return DEFAULT_PROMPT_SIZE;
  }
}
export function savePromptSize(v: PromptSize): void {
  void Preferences.set({ key: PREF_KEYS.promptSize, value: v }).catch(() => undefined);
}

/* ====================== Prompt info popover size ====================== */
export async function loadPromptInfoSize(): Promise<PromptInfoSize> {
  try {
    const { value } = await Preferences.get({ key: PREF_KEYS.promptInfoSize });
    if (value && (PROMPT_INFO_SIZE_VALUES as readonly string[]).includes(value)) {
      return value as PromptInfoSize;
    }
    return DEFAULT_PROMPT_INFO_SIZE;
  } catch {
    return DEFAULT_PROMPT_INFO_SIZE;
  }
}
export function savePromptInfoSize(v: PromptInfoSize): void {
  void Preferences.set({ key: PREF_KEYS.promptInfoSize, value: v }).catch(() => undefined);
}

/* ====================== Skip Chant Recital animation ====================== */
export const loadSkipChantRecital = () => readBool(PREF_KEYS.skipChantRecital, DEFAULT_SKIP_CHANT_RECITAL);
export const saveSkipChantRecital = (on: boolean) => writeBool(PREF_KEYS.skipChantRecital, on);

/* ======================== Playground composition ======================== */
export async function loadPlaygroundComposition(): Promise<PlaygroundComposition> {
  try {
    const { value } = await Preferences.get({ key: PREF_KEYS.playgroundComposition });
    if (!value) return { ...DEFAULT_PLAYGROUND_COMPOSITION };
    const parsed = JSON.parse(value) as Partial<PlaygroundComposition>;
    return { ...DEFAULT_PLAYGROUND_COMPOSITION, ...parsed };
  } catch {
    return { ...DEFAULT_PLAYGROUND_COMPOSITION };
  }
}
export function savePlaygroundComposition(comp: PlaygroundComposition): void {
  void Preferences.set({ key: PREF_KEYS.playgroundComposition, value: JSON.stringify(comp) }).catch(() => undefined);
}

/* ======================== Playground hand size ======================== */
export async function loadPlaygroundHandSize(): Promise<number> {
  try {
    const { value } = await Preferences.get({ key: PREF_KEYS.playgroundHandSize });
    const n = Number(value);
    if (Number.isFinite(n) && n >= 3 && n <= 14) return Math.round(n);
    return DEFAULT_PLAYGROUND_HAND_SIZE;
  } catch {
    return DEFAULT_PLAYGROUND_HAND_SIZE;
  }
}
export function savePlaygroundHandSize(n: number): void {
  void Preferences.set({ key: PREF_KEYS.playgroundHandSize, value: String(n) }).catch(() => undefined);
}
