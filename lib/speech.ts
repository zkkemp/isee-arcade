'use client';

/**
 * On-demand listening support for kids who cannot read yet (the kindergarten
 * and first-grade profiles). Uses the browser's built-in Web Speech API - no
 * assets, and it works offline on iOS Safari / the installed PWA.
 *
 * Speech is deliberately user-triggered. A child taps a speaker to start and
 * taps it again to stop; questions never begin talking by themselves.
 */

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Turn math and picture symbols into words so they read naturally aloud. */
export function toSpeakable(text: string): string {
  return text
    .replace(/\s*\bx\b\s*/gi, ' times ') // "7 x 8" -> "7 times 8"
    .replace(/\s*\+\s*/g, ' plus ')
    .replace(/\s*=\s*/g, ' equals ')
    .replace(/\s*<\s*/g, ' is less than ')
    .replace(/\s*>\s*/g, ' is greater than ')
    .replace(/(\d)\s*\/\s*(\d)/g, '$1 over $2') // fractions: "3/4" -> "3 over 4"
    .replace(/\s-\s/g, ' minus ')
    .replace(/\[\s*\]/g, ' blank ') // "[ ]" placeholder
    .replace(/[*_#|~^]+/g, ' ') // ASCII picture marks (e.g. "* * *")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build the full spoken line for a question: the prompt, then each choice by number. */
export function questionSpeech(prompt: string, choices: string[]): string {
  const p = toSpeakable(prompt);
  const opts = choices.map((c, i) => `Number ${i + 1}. ${toSpeakable(c)}.`).join(' ');
  return `${p}. The choices are: ${opts}`;
}

type SpeakOptions = {
  onStart?: () => void;
  onEnd?: () => void;
};

/**
 * Prefer the most natural local English voice the device exposes. Voice names
 * vary across Apple, Google and Microsoft, so this is a ranked fuzzy match with
 * a clean English fallback rather than one hard-coded platform voice.
 */
function preferredVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const english = synth.getVoices().filter((voice) => /^en([-_]|$)/i.test(voice.lang));
  if (english.length === 0) return null;
  const preferredNames = [
    'samantha',
    'ava',
    'allison',
    'susan',
    'google us english',
    'microsoft aria',
    'microsoft jenny',
    'daniel',
    'karen',
  ];
  for (const wanted of preferredNames) {
    const found = english.find((voice) => voice.name.toLowerCase().includes(wanted));
    if (found) return found;
  }
  return english.find((voice) => voice.localService && voice.default) ??
    english.find((voice) => voice.localService) ??
    english[0];
}

/** Speak a phrase, cancelling anything already speaking. No-op where unsupported. */
export function speak(text: string, options: SpeakOptions = {}): void {
  if (!speechAvailable()) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = preferredVoice(synth);
    if (voice) u.voice = voice;
    // Natural pacing without the high, synthetic "kid voice" effect.
    u.rate = 0.96;
    u.pitch = 1;
    u.lang = 'en-US';
    if (options.onStart) u.onstart = options.onStart;
    if (options.onEnd) {
      u.onend = options.onEnd;
      u.onerror = options.onEnd;
    }
    synth.speak(u);
  } catch {
    // No speech available; the on-screen text is still there.
  }
}

export function stopSpeaking(): void {
  if (!speechAvailable()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}
