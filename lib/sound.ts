'use client';

import { useEffect, useState } from 'react';

/**
 * Sound effects, synthesized with Web Audio rather than loaded from files.
 *
 * The obvious route was Kenney's CC0 audio packs, but they ship Ogg Vorbis only,
 * and Ogg support on iOS Safari is unreliable — on the primary target device the
 * sounds might simply never play. Transcoding needed ffmpeg, which isn't
 * installed, and macOS CoreAudio can't read Vorbis.
 *
 * Synthesis sidesteps all of it: no assets to download or serve, no codec
 * question, identical behaviour on every browser, and chiptune blips suit an
 * arcade better than realistic samples anyway. It's also parameterizable, so a
 * coin can rise in pitch with a combo.
 */

export type SoundName =
  | 'coin'
  | 'jump'
  | 'land'
  | 'stomp'
  | 'brick'
  | 'powerup'
  | 'correct'
  | 'wrong'
  | 'levelClear'
  | 'gameOver'
  | 'click'
  | 'pass';

const MUTE_KEY = 'isee-arcade:muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let unlocked = false;

function readMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * iOS will not start an AudioContext outside a user gesture, and a context
 * created too early stays suspended forever. This is called from the first real
 * pointer/key event and is a no-op afterwards.
 */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.35;
      master.connect(ctx.destination);
      muted = readMuted();
      if (master) master.gain.value = muted ? 0 : 0.35;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    unlocked = true;
  } catch {
    // No audio available. Everything below then silently does nothing.
  }
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}

export function setMuted(v: boolean): void {
  muted = v;
  if (master) master.gain.value = v ? 0 : 0.35;
  try {
    window.localStorage.setItem(MUTE_KEY, v ? '1' : '0');
  } catch {
    // ignore
  }
}

export function getMuted(): boolean {
  return muted;
}

// --- synthesis primitives ------------------------------------------------

type ToneOpts = {
  freq: number;
  /** Seconds. */
  dur: number;
  type?: OscillatorType;
  /** Peak gain before the master. */
  gain?: number;
  /** Slide to this frequency across the note. */
  to?: number;
  /** Seconds to wait before starting, for arpeggios. */
  delay?: number;
};

function tone({ freq, dur, type = 'square', gain = 0.5, to, delay = 0 }: ToneOpts): void {
  if (!ctx || !master || muted) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);

  // A short attack avoids the click you get from starting at full gain.
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.012, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Filtered noise, for impacts. */
function noise(dur: number, gain = 0.3, delay = 0): void {
  if (!ctx || !master || muted) return;
  const t0 = ctx.currentTime + delay;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    // Fade across the buffer so it reads as a hit rather than a burst of static.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = gain;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1800;
  src.connect(lp);
  lp.connect(g);
  g.connect(master);
  src.start(t0);
}

/** Notes in sequence. Semitone offsets from a root, in equal temperament. */
function arpeggio(root: number, steps: number[], step = 0.07, type: OscillatorType = 'square') {
  steps.forEach((s, i) => {
    tone({
      freq: root * Math.pow(2, s / 12),
      dur: step * 1.7,
      type,
      gain: 0.4,
      delay: i * step,
    });
  });
}

// --- the sounds ----------------------------------------------------------

export function playSound(name: SoundName, variation = 0): void {
  if (!ctx || muted) return;

  switch (name) {
    case 'coin':
      // Rises slightly with a combo, so a streak sounds like one.
      tone({ freq: 988 * Math.pow(2, Math.min(variation, 8) / 24), dur: 0.06, gain: 0.35 });
      tone({
        freq: 1319 * Math.pow(2, Math.min(variation, 8) / 24),
        dur: 0.11,
        gain: 0.3,
        delay: 0.055,
      });
      break;
    case 'jump':
      tone({ freq: 320, to: 760, dur: 0.13, type: 'square', gain: 0.3 });
      break;
    case 'land':
      tone({ freq: 170, to: 110, dur: 0.07, type: 'triangle', gain: 0.28 });
      noise(0.05, 0.12);
      break;
    case 'stomp':
      tone({ freq: 260, to: 90, dur: 0.14, type: 'sawtooth', gain: 0.3 });
      noise(0.09, 0.2);
      break;
    case 'brick':
      tone({ freq: 440 + variation * 40, dur: 0.05, type: 'square', gain: 0.3 });
      noise(0.04, 0.14);
      break;
    case 'powerup':
      arpeggio(392, [0, 4, 7, 12, 16], 0.06, 'square');
      break;
    case 'correct':
      arpeggio(523, [0, 4, 7, 12], 0.08, 'triangle');
      break;
    case 'wrong':
      // Deliberately gentle. A harsh buzzer on a wrong answer discourages trying.
      tone({ freq: 240, to: 150, dur: 0.22, type: 'triangle', gain: 0.26 });
      tone({ freq: 180, to: 120, dur: 0.26, type: 'triangle', gain: 0.2, delay: 0.06 });
      break;
    case 'levelClear':
      arpeggio(523, [0, 4, 7, 12, 7, 12, 16], 0.09, 'square');
      break;
    case 'gameOver':
      arpeggio(392, [0, -3, -7, -12], 0.13, 'triangle');
      break;
    case 'click':
      tone({ freq: 660, dur: 0.035, type: 'square', gain: 0.18 });
      break;
    case 'pass':
      arpeggio(659, [0, 7, 12, 19], 0.055, 'triangle');
      break;
  }
}

/** Mute state for a toggle button. */
export function useMuted(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(false);

  useEffect(() => {
    const stored = readMuted();
    muted = stored;
    if (master) master.gain.value = stored ? 0 : 0.35;
    setV(stored);
  }, []);

  return [
    v,
    (next: boolean) => {
      setMuted(next);
      setV(next);
      if (!next) {
        unlockAudio();
        playSound('click');
      }
    },
  ];
}
