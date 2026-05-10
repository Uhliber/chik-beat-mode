import { ref } from 'vue';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * Synthesised audio + haptic feedback for the game. No audio files — Web Audio generates
 * short tones with exponential decay envelopes; haptics go through @capacitor/haptics so
 * they fire on real iOS/Android devices and no-op gracefully on the web.
 *
 * Two families of feedback live here:
 *  - `ding(kind)` — the BEAT/Play mode metronome. 'middle' for in-between ticks, 'high'
 *    for the final tick of YOUR turn (DING!), 'low' for the final tick of someone else's.
 *  - `fx(kind)` — UI/game-event feedback. 'tap' for card or button presses, 'success' for
 *    a correct slam, 'fail' for a miscall / penalty / wrong card. Each kind layers a
 *    subtle haptic on top of the audio.
 *
 * `audioMuted` only gates audio. Haptics fire regardless — silent feedback is welcome
 * even when the player has muted sound for a public-place play.
 */
export type DingKind = 'middle' | 'high' | 'low';
export type FxKind = 'tap' | 'success' | 'fail';

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

/** Subtle 1.5 kHz sine click — short, percussive, used for any tap (button + card). */
function playTap(c: AudioContext): void {
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = 1500;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.06, now + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.06);
}

/** Two-tone arpeggio E5 → G5, "you got it" feel. */
function playSuccess(c: AudioContext): void {
  const now = c.currentTime;
  for (const [freq, offset] of [[660, 0], [784, 0.045]] as const) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = now + offset;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  }
}

/** Buzzy descending tone — triangle wave dropping 240 → 160 Hz. */
function playFail(c: AudioContext): void {
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(240, now);
  osc.frequency.exponentialRampToValueAtTime(160, now + 0.22);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.20, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.26);
}

const HAPTIC_BY_FX: Record<FxKind, ImpactStyle> = {
  tap: ImpactStyle.Light,
  success: ImpactStyle.Medium,
  fail: ImpactStyle.Heavy,
};

function fx(kind: FxKind): void {
  // Audio: gated by mute, lazy-init AudioContext on first call.
  if (!audioMuted.value) {
    const c = ensureContext();
    if (c) {
      if (c.state === 'suspended') c.resume().catch(() => undefined);
      if (kind === 'tap') playTap(c);
      else if (kind === 'success') playSuccess(c);
      else playFail(c);
    }
  }
  // Haptic: independent of mute. The plugin no-ops on web / unsupported devices.
  void Haptics.impact({ style: HAPTIC_BY_FX[kind] }).catch(() => undefined);
}

function setMuted(v: boolean): void {
  audioMuted.value = v;
}

export function useBeatAudio() {
  return { audioMuted, ding, fx, setMuted };
}
