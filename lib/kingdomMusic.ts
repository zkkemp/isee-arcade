'use client';

/**
 * A tiny original adventure theme synthesized in the browser. It deliberately
 * shares no melody, samples, or timing with a commercial platform game.
 */
export const KINGDOM_THEME: Array<number | null> = [
  64, 67, 71, 76, 74, 71, 67, null,
  62, 66, 69, 74, 71, 69, 66, null,
  64, 67, 72, 71, 67, 64, 59, null,
  62, 66, 71, 69, 66, 62, 57, null,
];

const BASS = [40, 40, 43, 43, 38, 38, 35, 35];
const MUTE_KEY = 'isee-arcade:muted';
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export function startKingdomMusic(): () => void {
  if (typeof window === 'undefined') return () => {};
  const AudioCtor = window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return () => {};

  let context: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let index = 0;
  let stopped = false;

  try {
    context = new AudioCtor();
    void context.resume();
  } catch {
    return () => {};
  }

  const note = (midi: number, duration: number, gain: number, type: OscillatorType) => {
    if (!context || stopped || window.localStorage.getItem(MUTE_KEY) === '1') return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = hz(midi);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(gain, now + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  };

  const tick = () => {
    if (!context || context.state === 'suspended') void context?.resume();
    const melody = KINGDOM_THEME[index % KINGDOM_THEME.length];
    if (melody !== null) note(melody, 0.17, 0.025, 'square');
    if (index % 4 === 0) note(BASS[Math.floor(index / 4) % BASS.length], 0.35, 0.035, 'triangle');
    index += 1;
  };
  tick();
  timer = setInterval(tick, 150);

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
    if (context && context.state !== 'closed') void context.close();
    context = null;
  };
}
