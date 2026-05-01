import { ref } from 'vue';

/**
 * Lightweight synth dings for the BEAT (Play) mode. No audio files — Web Audio generates
 * a short tone with an exponential decay envelope. Three pitches per turn:
 *  - 'middle' — E5 (660 Hz) — every tick that is NOT the final tick of a player's turn.
 *  - 'high'   — A5 (880 Hz) — the FINAL tick of YOUR turn (DING!).
 *  - 'low'    — A4 (440 Hz) — the FINAL tick of any other player's turn (DING!).
 *
 * So a 5-beat turn sounds: ding, ding, ding, ding, DING!
 *
 * The AudioContext is created lazily on the first ding so we don't fall foul of browsers
 * that require a user gesture before instantiating audio.
 */
export type DingKind = 'middle' | 'high' | 'low';

const audioMuted = ref(false);
let ctx: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

function ding(kind: DingKind): void {
  if (audioMuted.value) return;
  const c = ensureContext();
  if (!c) return;
  // If the context is suspended (e.g. tab inactive or no gesture yet), best-effort resume.
  if (c.state === 'suspended') c.resume().catch(() => undefined);

  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = kind === 'high' ? 880 : kind === 'low' ? 440 : 660;

  // Final dings (high / low) are louder than the in-between metronome ticks.
  const peak = kind === 'middle' ? 0.10 : 0.22;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

function setMuted(v: boolean): void {
  audioMuted.value = v;
}

export function useBeatAudio() {
  return { audioMuted, ding, setMuted };
}
