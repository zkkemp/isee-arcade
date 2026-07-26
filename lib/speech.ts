'use client';

/**
 * Read questions aloud for kids who cannot read yet (the kindergarten and
 * first-grade profiles). Uses the browser's built-in Web Speech API - no assets,
 * works offline on iOS Safari / the installed PWA.
 *
 * iOS only allows speech to START from inside a user gesture the first time, so
 * auto-narration may be silent until the child taps once; the on-screen speaker
 * button (a real tap) always works and is the reliable path.
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

/** Speak a phrase, cancelling anything already speaking. No-op where unsupported. */
export function speak(text: string): void {
  if (!speechAvailable()) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92; // a touch slower, easier for a young child to follow
    u.pitch = 1.08;
    u.lang = 'en-US';
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
