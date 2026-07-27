'use client';

import { useMemo, useState } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';

const COLORS = ['#fb7185', '#fbbf24', '#34d399', '#38bdf8', '#a78bfa', '#f472b6'];
const NAMES = ['coral', 'gold', 'mint', 'sky', 'violet', 'pink'];
const SLOTS = 4;
const MAX_GUESSES = 10;

export function scoreGemGuess(secret: number[], guess: number[]): { exact: number; close: number } {
  let exact = 0;
  const secretCounts = new Map<number, number>();
  const guessCounts = new Map<number, number>();
  secret.forEach((value, index) => {
    if (value === guess[index]) exact += 1;
    else {
      secretCounts.set(value, (secretCounts.get(value) ?? 0) + 1);
      guessCounts.set(guess[index], (guessCounts.get(guess[index]) ?? 0) + 1);
    }
  });
  let close = 0;
  guessCounts.forEach((count, value) => {
    close += Math.min(count, secretCounts.get(value) ?? 0);
  });
  return { exact, close };
}

function createSecret(colorCount: number): number[] {
  const pool = Array.from({ length: colorCount }, (_, index) => index);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[target]] = [pool[target], pool[index]];
  }
  return pool.slice(0, SLOTS);
}

type Guess = { colors: number[]; exact: number; close: number };

export default function GemCode({ paused, api, restartToken, difficulty }: GameCanvasProps) {
  const colorCount = difficulty === 'easy' ? 4 : difficulty === 'normal' ? 5 : 6;
  const [secret, setSecret] = useState(() => createSecret(colorCount));
  const [draft, setDraft] = useState<number[]>([]);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [won, setWon] = useState(false);
  const [lost, setLost] = useState(false);
  const resetKey = `${restartToken}:${colorCount}`;
  const [seenResetKey, setSeenResetKey] = useState(resetKey);
  if (seenResetKey !== resetKey) {
    setSeenResetKey(resetKey);
    setSecret(createSecret(colorCount));
    setDraft([]);
    setGuesses([]);
    setWon(false);
    setLost(false);
  }

  const selectedCounts = useMemo(() => {
    const counts = new Map<number, number>();
    draft.forEach((color) => counts.set(color, (counts.get(color) ?? 0) + 1));
    return counts;
  }, [draft]);

  function choose(color: number) {
    if (paused || won || lost || draft.length >= SLOTS || selectedCounts.has(color)) return;
    setDraft((current) => [...current, color]);
    playSound('click');
  }

  function submit() {
    if (paused || draft.length !== SLOTS || won || lost) return;
    const score = scoreGemGuess(secret, draft);
    const next = [...guesses, { colors: draft, ...score }];
    setGuesses(next);
    setDraft([]);
    if (score.exact === SLOTS) {
      setWon(true);
      api.addScore(Math.max(100, 320 - guesses.length * 22));
      api.requestGate('Gem code cracked!');
      playSound('levelClear');
    } else if (next.length >= MAX_GUESSES) {
      setLost(true);
      api.addScore(50);
      api.requestGate('Code revealed');
      playSound('gameOver');
    } else {
      playSound(score.exact > 0 ? 'powerup' : 'coin');
    }
  }

  function reset() {
    setSecret(createSecret(colorCount));
    setDraft([]);
    setGuesses([]);
    setWon(false);
    setLost(false);
    playSound('click');
  }

  return (
    <div className="absolute inset-0 overflow-auto bg-[radial-gradient(circle_at_50%_0%,#372b6f,#181a3f_52%,#0a0d23)] p-4 text-white sm:p-7">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[.16em] text-violet-100/45">
              Visual deduction lab
            </p>
            <h2 className="text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">Gem Code</h2>
            <p className="mt-1 text-xs text-violet-100/60 sm:text-sm">
              Bright pin = right gem, right place. Pale pin = right gem, different place.
            </p>
          </div>
          <button type="button" onClick={reset} className="min-h-11 rounded-xl bg-white/10 px-4 text-sm font-black text-white/75 hover:bg-white/15">
            New code
          </button>
        </div>

        <div className="mt-5 rounded-2xl bg-[#111735] p-3 shadow-[0_20px_45px_rgba(0,0,0,.35)] sm:p-5">
          <div className="grid max-h-[48dvh] gap-2 overflow-y-auto pr-1">
            {Array.from({ length: MAX_GUESSES }, (_, row) => {
              const guess = guesses[row];
              const active = row === guesses.length && !won && !lost;
              const values = guess?.colors ?? (active ? draft : []);
              return (
                <div key={row} className={`grid grid-cols-[2rem_1fr_4.5rem] items-center gap-2 rounded-xl px-2 py-2 ${active ? 'bg-violet-300/10' : 'bg-white/[0.025]'}`}>
                  <span className="text-center text-xs font-black text-white/35">{row + 1}</span>
                  <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: SLOTS }, (_, slot) => {
                      const color = values[slot];
                      return (
                        <span
                          key={slot}
                          className="aspect-square min-h-9 rounded-full bg-[#080d24] shadow-[inset_0_4px_9px_rgba(0,0,0,.5)] sm:min-h-11"
                          style={color === undefined ? undefined : { background: `radial-gradient(circle at 32% 26%, #fff9, ${COLORS[color]} 43%, #111 145%)`, boxShadow: `0 0 14px ${COLORS[color]}55` }}
                        />
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-4 gap-1" aria-label={guess ? `${guess.exact} exact and ${guess.close} close` : 'No clue yet'}>
                    {Array.from({ length: SLOTS }, (_, pin) => (
                      <span key={pin} className={`aspect-square rounded-full ${guess && pin < guess.exact ? 'bg-cyan-200 shadow-[0_0_8px_#a5f3fc]' : guess && pin < guess.exact + guess.close ? 'bg-violet-300/55' : 'bg-white/10'}`} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-6 gap-2">
          {COLORS.slice(0, colorCount).map((color, index) => (
            <button
              key={color}
              type="button"
              aria-label={`Choose ${NAMES[index]}`}
              disabled={paused || won || lost || selectedCounts.has(index)}
              onClick={() => choose(index)}
              className="aspect-square min-h-11 rounded-2xl p-[16%] transition enabled:hover:-translate-y-0.5 enabled:active:scale-90 disabled:opacity-25 sm:min-h-14"
              style={{ background: `${color}20` }}
            >
              <span className="block h-full w-full rounded-full" style={{ background: `radial-gradient(circle at 32% 25%, #fff9, ${color} 46%, #111 145%)`, boxShadow: `0 8px 18px ${color}35` }} />
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-[1fr_2fr] gap-3">
          <button type="button" onClick={() => setDraft((current) => current.slice(0, -1))} disabled={draft.length === 0 || won || lost} className="min-h-12 rounded-xl bg-white/10 text-sm font-black text-white/70 disabled:opacity-30">
            Undo
          </button>
          <button type="button" onClick={submit} disabled={draft.length !== SLOTS || won || lost} className="min-h-12 rounded-xl bg-cyan-300 text-sm font-black text-[#11162d] shadow-[0_12px_25px_rgba(34,211,238,.2)] disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none">
            Lock in guess
          </button>
        </div>

        {(won || lost) && (
          <div role="status" className="mt-4 rounded-2xl bg-white/10 px-5 py-4 text-center">
            <strong className="text-xl text-amber-200">{won ? `Code cracked in ${guesses.length} guesses!` : 'The vault revealed its code.'}</strong>
            <div className="mx-auto mt-3 flex max-w-xs justify-center gap-2">
              {secret.map((color) => <span key={color} className="h-10 w-10 rounded-full" style={{ background: COLORS[color] }} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
