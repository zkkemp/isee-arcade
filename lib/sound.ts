'use client';

import { useEffect, useState } from 'react';
import { MUSIC_PATTERNS, type MusicTheme } from './gameMusic';

/**
 * Original, synthesized game audio. Web Audio keeps the bundle small and works
 * reliably on iPhone/iPad without relying on a compressed-audio codec.
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
const MUSIC_KEY = 'isee-arcade:music-enabled';
const MASTER_GAIN = 0.3;
const EFFECTS_GAIN = 0.72;
const MUSIC_GAIN = 0.095;

/** Prevent doubled shell/game events and rapid collisions from sounding harsh. */
export const SOUND_COOLDOWNS: Record<SoundName, number> = {
  coin: 28,
  jump: 48,
  land: 95,
  stomp: 90,
  brick: 65,
  powerup: 110,
  correct: 160,
  wrong: 180,
  levelClear: 520,
  gameOver: 520,
  click: 45,
  pass: 220,
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let effectsBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let muted = false;
let musicEnabled = true;
let unlocked = false;
const lastPlayed = new Map<SoundName, number>();

function readMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function readMusicEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(MUSIC_KEY) !== '0';
  } catch {
    return true;
  }
}

/**
 * iOS will not start an AudioContext outside a user gesture. GameShell calls
 * this from a real pointer event; all callers may safely call it again.
 */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return;
  try {
    muted = readMuted();
    musicEnabled = readMusicEnabled();
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      master = ctx.createGain();
      effectsBus = ctx.createGain();
      musicBus = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_GAIN;
      effectsBus.gain.value = EFFECTS_GAIN;
      musicBus.gain.value = musicEnabled ? MUSIC_GAIN : 0;
      effectsBus.connect(master);
      musicBus.connect(master);
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    unlocked = true;
  } catch {
    // Audio is an enhancement; games remain fully playable when unavailable.
  }
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}

export function setMuted(v: boolean): void {
  muted = v;
  if (master) master.gain.value = v ? 0 : MASTER_GAIN;
  try {
    window.localStorage.setItem(MUTE_KEY, v ? '1' : '0');
  } catch {
    // Non-fatal preference write.
  }
}

export function getMuted(): boolean {
  return muted;
}

export function setMusicEnabled(v: boolean): void {
  musicEnabled = v;
  if (musicBus) {
    const now = ctx?.currentTime ?? 0;
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setTargetAtTime(v ? MUSIC_GAIN : 0, now, 0.035);
  }
  try {
    window.localStorage.setItem(MUSIC_KEY, v ? '1' : '0');
  } catch {
    // Non-fatal preference write.
  }
}

type ToneOpts = {
  freq: number;
  /** Seconds. */
  dur: number;
  type?: OscillatorType;
  /** Peak gain before the effects bus. */
  gain?: number;
  /** Slide to this frequency across the note. */
  to?: number;
  /** Seconds to wait before starting, for arpeggios. */
  delay?: number;
};

function tone({ freq, dur, type = 'triangle', gain = 0.3, to, delay = 0 }: ToneOpts): void {
  if (!ctx || !effectsBus || muted) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const envelope = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  }

  envelope.gain.setValueAtTime(0, t0);
  envelope.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.02, dur * 0.3));
  envelope.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(envelope);
  envelope.connect(effectsBus);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

/** Low, filtered texture for impacts—never bright static. */
function noise(dur: number, gain = 0.06, delay = 0): void {
  if (!ctx || !effectsBus || muted) return;
  const t0 = ctx.currentTime + delay;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const source = ctx.createBufferSource();
  const envelope = ctx.createGain();
  const lowpass = ctx.createBiquadFilter();
  source.buffer = buffer;
  envelope.gain.value = gain;
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 1050;
  source.connect(lowpass);
  lowpass.connect(envelope);
  envelope.connect(effectsBus);
  source.start(t0);
}

function arpeggio(
  root: number,
  steps: number[],
  step = 0.08,
  type: OscillatorType = 'triangle',
  gain = 0.24,
): void {
  steps.forEach((semitones, index) => {
    tone({
      freq: root * 2 ** (semitones / 12),
      dur: step * 1.75,
      type,
      gain,
      delay: index * step,
    });
  });
}

export function playSound(name: SoundName, variation = 0): void {
  if (!ctx || muted) return;
  const now = performance.now();
  const previous = lastPlayed.get(name) ?? -Infinity;
  if (now - previous < SOUND_COOLDOWNS[name]) return;
  lastPlayed.set(name, now);

  switch (name) {
    case 'coin':
      tone({
        freq: 880 * 2 ** (Math.min(variation, 8) / 24),
        dur: 0.07,
        type: 'sine',
        gain: 0.22,
      });
      tone({
        freq: 1175 * 2 ** (Math.min(variation, 8) / 24),
        dur: 0.12,
        type: 'triangle',
        gain: 0.16,
        delay: 0.06,
      });
      break;
    case 'jump':
      tone({ freq: 300, to: 690, dur: 0.14, type: 'triangle', gain: 0.2 });
      break;
    case 'land':
      tone({ freq: 155, to: 112, dur: 0.08, type: 'sine', gain: 0.18 });
      noise(0.045, 0.035);
      break;
    case 'stomp':
      tone({ freq: 235, to: 88, dur: 0.15, type: 'triangle', gain: 0.21 });
      noise(0.07, 0.055);
      break;
    case 'brick':
      tone({
        freq: 390 + Math.min(variation, 8) * 32,
        dur: 0.065,
        type: 'triangle',
        gain: 0.18,
      });
      noise(0.035, 0.03);
      break;
    case 'powerup':
      arpeggio(392, [0, 4, 7, 12, 16], 0.07, 'triangle', 0.2);
      break;
    case 'correct':
      arpeggio(523, [0, 4, 7, 12], 0.085, 'sine', 0.22);
      break;
    case 'wrong':
      // A wrong answer should guide, never scold.
      tone({ freq: 225, to: 155, dur: 0.24, type: 'sine', gain: 0.16 });
      tone({ freq: 175, to: 128, dur: 0.28, type: 'triangle', gain: 0.11, delay: 0.07 });
      break;
    case 'levelClear':
      arpeggio(523, [0, 4, 7, 12, 7, 12, 16], 0.095, 'triangle', 0.21);
      break;
    case 'gameOver':
      arpeggio(370, [0, -3, -7, -12], 0.14, 'sine', 0.16);
      break;
    case 'click':
      tone({ freq: 610, dur: 0.045, type: 'sine', gain: 0.09 });
      break;
    case 'pass':
      arpeggio(622, [0, 7, 12, 19], 0.065, 'sine', 0.18);
      break;
  }
}

function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function musicTone(
  midi: number,
  duration: number,
  gain: number,
  type: OscillatorType,
): void {
  if (!ctx || !musicBus || muted || !musicEnabled || document.hidden) return;
  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  const lowpass = ctx.createBiquadFilter();
  oscillator.type = type;
  oscillator.frequency.value = midiToHz(midi);
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 1600;
  envelope.gain.setValueAtTime(0, now);
  envelope.gain.linearRampToValueAtTime(gain, now + Math.min(0.055, duration * 0.22));
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(lowpass);
  lowpass.connect(envelope);
  envelope.connect(musicBus);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.04);
}

function startGameMusic(theme: MusicTheme): () => void {
  if (!ctx || !musicBus || muted || !musicEnabled) return () => {};
  const pattern = MUSIC_PATTERNS[theme];
  let index = 0;
  const tick = () => {
    if (!ctx || muted || !musicEnabled || document.hidden) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const melody = pattern.melody[index % pattern.melody.length];
    if (melody !== null) {
      musicTone(
        melody,
        Math.min(0.55, (pattern.stepMs / 1000) * 0.88),
        pattern.melodyGain,
        pattern.melodyWave,
      );
    }
    if (index % 4 === 0) {
      const bassIndex = Math.floor(index / 4) % pattern.bass.length;
      musicTone(
        pattern.bass[bassIndex],
        Math.min(1.25, (pattern.stepMs / 1000) * 3.2),
        pattern.bassGain,
        pattern.bassWave,
      );
    }
    index += 1;
  };
  tick();
  const timer = window.setInterval(tick, pattern.stepMs);
  return () => window.clearInterval(timer);
}

/** Mute state for the all-audio toggle. */
export function useMuted(): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(false);

  useEffect(() => {
    const stored = readMuted();
    muted = stored;
    if (master) master.gain.value = stored ? 0 : MASTER_GAIN;
    setValue(stored);
  }, []);

  return [
    value,
    (next: boolean) => {
      setMuted(next);
      setValue(next);
      if (!next) {
        unlockAudio();
        playSound('click');
      }
    },
  ];
}

/** Music can be disabled without losing useful game feedback sounds. */
export function useMusicEnabled(): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(true);

  useEffect(() => {
    const stored = readMusicEnabled();
    musicEnabled = stored;
    if (musicBus) musicBus.gain.value = stored ? MUSIC_GAIN : 0;
    setValue(stored);
  }, []);

  return [
    value,
    (next: boolean) => {
      unlockAudio();
      setMusicEnabled(next);
      setValue(next);
    },
  ];
}

/**
 * Starts only after a real interaction, stops while a question/pause is open,
 * and automatically follows the music and all-audio preferences.
 */
export function useGameMusic(
  theme: MusicTheme | undefined,
  active: boolean,
  enabled: boolean,
  allAudioMuted: boolean,
): void {
  useEffect(() => {
    if (!theme || !active || !enabled || allAudioMuted) return;
    let stop: (() => void) | null = null;
    const begin = () => {
      unlockAudio();
      stop ??= startGameMusic(theme);
    };

    if (isAudioUnlocked()) begin();
    else {
      window.addEventListener('pointerdown', begin, { once: true });
      window.addEventListener('keydown', begin, { once: true });
    }

    return () => {
      window.removeEventListener('pointerdown', begin);
      window.removeEventListener('keydown', begin);
      stop?.();
    };
  }, [active, allAudioMuted, enabled, theme]);
}
