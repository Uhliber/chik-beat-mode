/**
 * Build-time feature flags read from Vite env vars. Each flag defaults to OFF so a
 * stock build (e.g. a production deploy without explicit env config) ships only the
 * known-good baseline — opting in is explicit.
 *
 * Vite exposes env vars as strings on `import.meta.env`, so we coerce. Set values in
 * `.env`, `.env.local`, or `.env.<mode>` files at the project root, e.g.:
 *
 *   VITE_PLAYGROUND_ENABLED=true
 */

function parseBool(value: unknown, defaultValue: boolean): boolean {
  if (typeof value !== 'string') return defaultValue;
  const lower = value.toLowerCase().trim();
  if (lower === '1' || lower === 'true' || lower === 'yes' || lower === 'on') return true;
  if (lower === '0' || lower === 'false' || lower === 'no' || lower === 'off' || lower === '') {
    return false;
  }
  return defaultValue;
}

export const FLAGS = {
  /** Playground sandbox mode — Versus with deck-composition + hand-size knobs.
   *  Off by default. Enable with `VITE_PLAYGROUND_ENABLED=true` in `.env.local`. */
  playgroundEnabled: parseBool(import.meta.env.VITE_PLAYGROUND_ENABLED, false),
} as const;
