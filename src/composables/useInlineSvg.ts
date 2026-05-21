import { ref, watchEffect, type Ref } from 'vue';

/**
 * Inline-SVG loader with `currentColor` recoloring. Fetches an SVG from a public URL,
 * strips any hard-coded fill/stroke colors, and replaces them with `currentColor` so a
 * wrapper element's `color` CSS controls the rendered tint.
 *
 * Use this for icon-style SVGs we want to recolor at runtime (prompt + count badges).
 * Results are cached in-module so repeated calls for the same URL hit the cache.
 *
 * Why so aggressive: a few of the supplied SVGs hide their color inside a `<style>`
 * block that doesn't get parsed when the SVG is inlined via v-html (the style scope
 * applies to the SVG document, but Vue's v-html keeps the markup in the document tree
 * where global CSS selectors clash). Stripping the style block AND forcing fill on
 * every visible element with `currentColor` reliably lands the wrapper's color tint.
 */
const cache = new Map<string, Promise<string>>();

/** SVG primitives that have a default fill (need `fill="currentColor"` applied if they
 *  don't carry an explicit color). Strokes are left alone unless they were set. */
const FILLED_ELEMENTS = ['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'g'];

function recolor(svgText: string): string {
  let out = svgText;
  // 1. Strip <style>…</style> blocks — these often hold the dark fill via class selectors
  //    that won't apply consistently when the SVG is injected via v-html.
  out = out.replace(/<style[\s\S]*?<\/style>/gi, '');
  // 2. Inline style fill / stroke → currentColor.
  out = out.replace(/fill\s*:\s*[^;"']+/gi, 'fill: currentColor');
  out = out.replace(/stroke\s*:\s*[^;"']+/gi, 'stroke: currentColor');
  // 3. Attribute fill / stroke (with explicit value, not 'none') → currentColor.
  out = out.replace(/\bfill="(?!none)[^"]*"/gi, 'fill="currentColor"');
  out = out.replace(/\bstroke="(?!none)[^"]*"/gi, 'stroke="currentColor"');
  // 4. Belt + suspenders: ensure every common visible element carries fill="currentColor".
  //    Catches the case where the source SVG had NO fill attribute at all (browsers
  //    default to black unless an ancestor overrides). Skip elements that already have
  //    a fill attribute or a `fill: none` inline style.
  for (const tag of FILLED_ELEMENTS) {
    const re = new RegExp(`<${tag}\\b([^>]*)`, 'gi');
    out = out.replace(re, (full, attrs) => {
      if (/\bfill\s*=/i.test(attrs)) return full;
      if (/fill\s*:\s*none/i.test(attrs)) return full;
      return `<${tag} fill="currentColor"${attrs}`;
    });
  }
  return out;
}

async function loadSvgRaw(url: string): Promise<string> {
  // CRITICAL: cache the RECOLORED output, not the raw fetch. Earlier this cached the
  // raw-text promise — the first caller awaited then recolored locally, but every
  // subsequent caller got the cache hit and returned the raw text (bypassing recolor).
  // Result: most popovers rendered black because they shared the same SVG URL with an
  // earlier "first caller" that pulled the raw stream first.
  const cached = cache.get(url);
  if (cached) return cached;
  const p = (async () => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`SVG ${url} ${r.status}`);
    return recolor(await r.text());
  })();
  cache.set(url, p);
  try {
    return await p;
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
