/**
 * Reset utility for local persisted state. Surfaces a `chikReset` function on `window`
 * so you can clear stored state from the browser DevTools console, useful when you
 * want a "fresh start" while developing the tutorial, best-times, or sandbox settings.
 *
 * Usage in the console:
 *   chikReset()              // wipe everything (settings + best times + tutorial)
 *   chikReset('tutorial')    // wipe just tutorial-completion flags
 *   chikReset('settings')    // wipe just display + gameplay prefs (Best time stays)
 *
 * Key lists are sourced directly from the modules that OWN those keys
 * (`PREF_KEYS` in userPreferences.ts, `TUTORIAL_PREF_KEYS` in tutorial/persistence.ts)
 * so this file can never drift out of date when new prefs land.
 *
 * Gated by the `devtoolCommandsEnabled` flag (see config/flags.ts). Defaults ON in
 * dev builds, OFF in production. Disable in dev too with
 * `VITE_DEVTOOL_COMMANDS_ENABLED=false` in `.env.local`.
 *
 * Capacitor Preferences on web stores entries in localStorage with a
 * `CapacitorStorage.` prefix, so we remove both the prefixed form and the bare key -
 * belt-and-suspenders in case the platform layer changes.
 */

import { Preferences } from '@capacitor/preferences';
import { PREF_KEYS } from '@/composables/userPreferences';
import { TUTORIAL_PREF_KEYS } from '@/tutorial/persistence';
import { FLAGS } from '@/config/flags';

export type ResetScope = 'all' | 'tutorial' | 'settings';

/** All settings / persisted preferences. Pulled from PREF_KEYS so adding a new
 *  pref in userPreferences.ts automatically gets covered here, no duplication. */
const SETTINGS_KEYS: readonly string[] = Object.values(PREF_KEYS);

function keysForScope(scope: ResetScope): readonly string[] {
  switch (scope) {
    case 'tutorial': return TUTORIAL_PREF_KEYS;
    case 'settings': return SETTINGS_KEYS;
    case 'all':      return [...TUTORIAL_PREF_KEYS, ...SETTINGS_KEYS];
  }
}

export async function chikReset(scope: ResetScope = 'all'): Promise<void> {
  const keys = keysForScope(scope);
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
 *  at app startup from main.ts. Logs a one-time hint so devs know the command exists.
 *  No-ops when `FLAGS.devtoolCommandsEnabled` is false (production by default). */
export function installChikResetCommand(): void {
  if (typeof window === 'undefined') return;
  if (!FLAGS.devtoolCommandsEnabled) return;
  (window as unknown as { chikReset: typeof chikReset }).chikReset = chikReset;
  // eslint-disable-next-line no-console
  console.log(
    '%c[chik]%c Reset command available: chikReset() · chikReset("tutorial") · chikReset("settings")',
    'background:#e7593d;color:#fcf6e6;padding:2px 6px;border-radius:4px;font-weight:700;',
    'color:#888;',
  );
}
