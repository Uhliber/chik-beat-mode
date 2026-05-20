import { ref, watchEffect, type Ref } from 'vue';

/**
 * Inline-SVG loader with `currentColor` recoloring. Fetches an SVG from a public URL,
 * strips any hard-coded fill/stroke colors, and replaces them with `currentColor` so a
 * wrapper element's `color` CSS controls the rendered tint.
 *
 * Use this for icon-style SVGs we want to recolor at runtime (prompt + count badges).
 * Results are cached in-module so repeated calls for the same URL hit the cache.
 */
const cache = new Map<string, Promise<string>>();

function recolor(svgText: string): string {
  // Strip <style>…</style> blocks (the new/* prompt SVGs hide their color inside
  // `style="fill: #231f20"` selectors). Easier to strip than to surgically patch.
  let out = svgText.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Inline style fill / stroke → currentColor.
  out = out.replace(/fill\s*:\s*[^;"']+/gi, 'fill: currentColor');
  out = out.replace(/stroke\s*:\s*[^;"']+/gi, 'stroke: currentColor');
  // Attribute fill / stroke (with explicit value, not 'none').
  out = out.replace(/\bfill="(?!none)[^"]*"/gi, 'fill="currentColor"');
  out = out.replace(/\bstroke="(?!none)[^"]*"/gi, 'stroke="currentColor"');
  // Ensure the root <svg> carries a fill so untreated <path> elements inherit it.
  out = out.replace(/<svg\b([^>]*)>/i, (full, attrs) => {
    if (/\bfill=/i.test(attrs)) return full;
    return `<svg${attrs} fill="currentColor">`;
  });
  return out;
}

async function loadSvgRaw(url: string): Promise<string> {
  const cached = cache.get(url);
  if (cached) return cached;
  const p = fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`SVG ${url} ${r.status}`))));
  cache.set(url, p);
  try {
    const text = await p;
    return recolor(text);
  } catch (err) {
    cache.delete(url);
    throw err;
  }
}

/** Reactive SVG markup that follows the supplied url ref. Returns '' until first load. */
export function useInlineSvg(urlRef: Ref<string | null>): Ref<string> {
  const html = ref('');
  watchEffect(async (onCleanup) => {
    const url = urlRef.value;
    if (!url) { html.value = ''; return; }
    let cancelled = false;
    onCleanup(() => { cancelled = true; });
    try {
      const out = await loadSvgRaw(url);
      if (!cancelled) html.value = out;
    } catch {
      if (!cancelled) html.value = '';
    }
  });
  return html;
}
