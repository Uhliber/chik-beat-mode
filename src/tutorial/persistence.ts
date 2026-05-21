/**
 * Tutorial completion persistence. Mirrors the load/save pattern useGame uses for the
 * solo best time and other Capacitor Preferences, fire-and-forget writes (never throw
 * from a winner-handler path), async reads that fall back to `false` on any error.
 */

import { Preferences } from '@capacitor/preferences';

const SOLO_KEY = 'chik-tutorial-solo-completed';
const VERSUS_KEY = 'chik-tutorial-versus-completed';

/** All persisted tutorial-completion keys. Re-exported so the dev `chikReset`
 *  helper (and any future bulk-clear utility) can wipe them without duplicating
 *  the key strings. Keep this in sync if new tutorial modes are added. */
export const TUTORIAL_PREF_KEYS: readonly string[] = [SOLO_KEY, VERSUS_KEY];

export type TutorialMode = 'solo' | 'versus';

export interface TutorialCompletion {
  solo: boolean;
  versus: boolean;
}

function isTrue(value: string | null | undefined): boolean {
  return value === '1' || value === 'true';
}

export async function loadTutorialCompletion(): Promise<TutorialCompletion> {
  try {
    const [s, v] = await Promise.all([
      Preferences.get({ key: SOLO_KEY }),
      Preferences.get({ key: VERSUS_KEY }),
    ]);
    return {
      solo: isTrue(s.value),
      versus: isTrue(v.value),
    };
  } catch {
    return { solo: false, versus: false };
  }
}

export function saveTutorialCompletion(mode: TutorialMode): void {
  const key = mode === 'solo' ? SOLO_KEY : VERSUS_KEY;
  void Preferences.set({ key, value: '1' }).catch(() => undefined);
}

/** Test-only: clear completion. Not invoked from production code. */
export function clearTutorialCompletion(mode?: TutorialMode): void {
  const keys = mode ? [mode === 'solo' ? SOLO_KEY : VERSUS_KEY] : [SOLO_KEY, VERSUS_KEY];
  for (const key of keys) {
    void Preferences.remove({ key }).catch(() => undefined);
  }
}
