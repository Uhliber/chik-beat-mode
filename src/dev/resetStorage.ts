/**
 * Reset utility for local persisted state. Surfaces a `chikReset` function on `window`
 * so you can clear stored state from the browser DevTools console — useful when you
 * want a "fresh start" while developing the tutorial, best-times, or sandbox settings.
 *
 * Usage in the console:
 *   chikReset()              // wipe everything below
 *   chikReset('tutorial')    // wipe just tutorial-completion flags
 *
 * Capacitor Preferences on web stores entries in localStorage with a
 * `CapacitorStorage.` prefix, so we remove both the prefixed form and the bare key —
 * belt-and-suspenders in case the platform layer changes.
 */

import { Preferences } from '@capacitor/preferences';

export type ResetScope = 'all' | 'tutorial';

const TUTORIAL_KEYS: readonly string[] = [
  'chik-tutorial-solo-completed',
  'chik-tutorial-versus-completed',
];

const SETTINGS_KEYS: readonly string[] = [
  'chik-solo-best-time-ms',
  'chik-wisp-enabled',
  'chik-strict-prompts',
  'chik-ai-skill',
  'chik-playground-composition',
  'chik-playground-hand-size',
  'chik-prompt-size',
];

export async function chikReset(scope: ResetScope = 'all'): Promise<void> {
  const keys = scope === 'tutorial' ? TUTORIAL_KEYS : [...TUTORIAL_KEYS, ...SETTINGS_KEYS];
  for (const key of keys) {
    try { await Preferences.remove({ key }); } catch { /* swallow */ }
    // Belt-and-suspenders: also clear from raw localStorage in case the Capacitor web
    // adapter version uses a different storage shape.
    if (typeof window !== 'undefined' && window.localStorage) {
      try { window.localStorage.removeItem('CapacitorStorage.' + key); } catch { /* swallow */ }
      try { window.localStorage.removeItem(key); } catch { /* swallow */ }
    }
  }
  // eslint-disable-next-line no-console
  console.log(
    `[chikReset] Cleared ${keys.length} key${keys.length === 1 ? '' : 's'} (scope: ${scope}).`,
    'Reload the page to see fresh state.',
  );
}

/** Install the reset command on `window` so it's reachable from DevTools. Called once
 *  at app startup from main.ts. Logs a one-time hint so devs know the command exists. */
export function installChikResetCommand(): void {
  if (typeof window === 'undefined') return;
  (window as unknown as { chikReset: typeof chikReset }).chikReset = chikReset;
  // eslint-disable-next-line no-console
  console.log(
    '%c[chik]%c Reset command available: chikReset() · chikReset("tutorial")',
    'background:#e7593d;color:#fcf6e6;padding:2px 6px;border-radius:4px;font-weight:700;',
    'color:#888;',
  );
}
