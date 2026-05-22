import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Capacitor Preferences plugin BEFORE importing the SUT. The plugin is
// otherwise a thin wrapper around localStorage on web; on Node (vitest) it tries to
// reach the native bridge and throws. We sub in a deterministic in-memory store.
const store = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.has(key) ? store.get(key)! : null }),
    set: async ({ key, value }: { key: string; value: string }) => {
      store.set(key, value);
    },
    remove: async ({ key }: { key: string }) => {
      store.delete(key);
    },
  },
}));

import { loadTutorialCompletion, saveTutorialCompletion, clearTutorialCompletion } from '../persistence';

beforeEach(() => {
  store.clear();
});

describe('loadTutorialCompletion', () => {
  it('returns both false when nothing is persisted', async () => {
    const c = await loadTutorialCompletion();
    expect(c).toEqual({ solo: false, versus: false });
  });

  it('returns true for whichever flags are set', async () => {
    saveTutorialCompletion('solo');
    // Saves are fire-and-forget, give the microtask a beat to land.
    await Promise.resolve();
    const c = await loadTutorialCompletion();
    expect(c.solo).toBe(true);
    expect(c.versus).toBe(false);

    saveTutorialCompletion('versus');
    await Promise.resolve();
    const c2 = await loadTutorialCompletion();
    expect(c2.solo).toBe(true);
    expect(c2.versus).toBe(true);
  });

  it('accepts legacy string "true" alongside "1"', async () => {
    store.set('chik-tutorial-solo-completed', 'true');
    const c = await loadTutorialCompletion();
    expect(c.solo).toBe(true);
  });
});

describe('clearTutorialCompletion', () => {
  it('clears a specific mode flag', async () => {
    saveTutorialCompletion('solo');
    saveTutorialCompletion('versus');
    await Promise.resolve();
    clearTutorialCompletion('solo');
    await Promise.resolve();
    const c = await loadTutorialCompletion();
    expect(c.solo).toBe(false);
    expect(c.versus).toBe(true);
  });

  it('clears all flags when called without arguments', async () => {
    saveTutorialCompletion('solo');
    saveTutorialCompletion('versus');
    await Promise.resolve();
    clearTutorialCompletion();
    await Promise.resolve();
    const c = await loadTutorialCompletion();
    expect(c).toEqual({ solo: false, versus: false });
  });
});
