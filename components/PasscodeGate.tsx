'use client';

import { useEffect, useState } from 'react';
import {
  PASSCODE_ENABLED,
  PASSCODE_HASH,
  UNLOCK_KEY,
  sha256Hex,
} from '@/lib/passcode';

const LENGTH = 4;

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

/**
 * Wraps the app in a passcode prompt when NEXT_PUBLIC_PASSCODE_SHA256 is set.
 * Unlocking is remembered on the device, so it is asked once per install rather
 * than every launch.
 */
export default function PasscodeGate({ children }: { children: React.ReactNode }) {
  // No hash configured means no gate at all — skip every hook path below.
  const [unlocked, setUnlocked] = useState(!PASSCODE_ENABLED);
  const [checked, setChecked] = useState(!PASSCODE_ENABLED);
  const [entry, setEntry] = useState('');
  const [wrong, setWrong] = useState(false);

  // localStorage is unavailable during the server render, so the stored unlock
  // can only be read after mount.
  useEffect(() => {
    if (!PASSCODE_ENABLED) return;
    try {
      if (window.localStorage.getItem(UNLOCK_KEY) === PASSCODE_HASH) setUnlocked(true);
    } catch {
      // Private browsing: fall through to the prompt.
    }
    setChecked(true);
  }, []);

  // Checking happens here rather than in the tap handler. Two fast taps land in
  // one React batch, so a handler that read `entry` from its own render closure
  // saw a stale value and silently dropped a digit — which a kid drumming on an
  // iPad hits constantly.
  useEffect(() => {
    if (entry.length < LENGTH) return;
    let cancelled = false;
    void (async () => {
      const hash = await sha256Hex(entry);
      if (cancelled) return;
      if (hash === PASSCODE_HASH) {
        try {
          window.localStorage.setItem(UNLOCK_KEY, hash);
        } catch {
          // Not fatal — they just get asked again next launch.
        }
        setUnlocked(true);
        return;
      }
      setWrong(true);
      setEntry('');
    })();
    return () => {
      cancelled = true;
    };
  }, [entry]);

  const press = (key: string) => {
    setWrong(false);
    if (key === '⌫') {
      setEntry((e) => e.slice(0, -1));
      return;
    }
    if (key === '') return;
    // Functional update so batched taps accumulate instead of overwriting.
    setEntry((e) => (e + key).slice(0, LENGTH));
  };

  if (unlocked) return <>{children}</>;

  // Avoid flashing the prompt before the stored unlock has been read.
  if (!checked) return null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-white">
          ISEE <span className="text-[#a78bfa]">Arcade</span>
        </h1>
        <p className="mt-2 text-sm text-white/50">Enter the passcode to play.</p>
      </div>

      <div className="mb-6 flex gap-3" aria-label={`${entry.length} digits entered`}>
        {Array.from({ length: LENGTH }, (_, i) => (
          <span
            key={i}
            className="h-4 w-4 rounded-full border transition"
            style={{
              borderColor: wrong ? '#fb7185' : 'rgba(255,255,255,0.3)',
              background:
                i < entry.length ? (wrong ? '#fb7185' : '#a78bfa') : 'transparent',
            }}
          />
        ))}
      </div>

      {/* `invisible` rather than transparent text: it reserves the layout space
          without leaving the message in the accessibility tree. */}
      <p
        role="status"
        className={`mb-6 h-5 text-sm text-rose-400 ${wrong ? '' : 'invisible'}`}
      >
        Not quite — try again.
      </p>

      <div className="grid grid-cols-3 gap-3">
        {DIGITS.map((d, i) => (
          <button
            key={i}
            type="button"
            onClick={() => press(d)}
            disabled={d === ''}
            className={`h-16 w-16 rounded-2xl text-xl font-bold transition active:scale-95 ${
              d === ''
                ? 'invisible'
                : 'border border-white/15 bg-white/[0.06] text-white/85 hover:bg-white/[0.12]'
            }`}
          >
            {d}
          </button>
        ))}
      </div>
    </main>
  );
}
