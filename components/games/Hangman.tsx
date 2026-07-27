'use client';

import { useState } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import { ALPHABET, wordForRound, type WordCard } from '@/lib/wordGames';
import { useActiveProfile } from '@/lib/profiles';
import { playSound } from '@/lib/sound';

const MAX_MISSES = 7;

export default function Hangman({
  paused,
  api,
  restartToken,
  difficulty,
}: GameCanvasProps) {
  const profile = useActiveProfile();
  const band = profile?.band ?? 'isee';
  return (
    <HangmanGame
      key={`${band}-${difficulty}-${restartToken}`}
      paused={paused}
      api={api}
      restartToken={restartToken}
      difficulty={difficulty}
      band={band}
    />
  );
}

function HangmanGame({
  paused,
  api,
  restartToken,
  difficulty,
  band,
}: Pick<GameCanvasProps, 'paused' | 'api' | 'restartToken' | 'difficulty'> & {
  band: 'k' | 'grade1' | 'grade3' | 'isee';
}) {
  const [round, setRound] = useState(1);
  const [card, setCard] = useState<WordCard>(() => wordForRound(band, difficulty, 1, restartToken));
  const [guessed, setGuessed] = useState<string[]>([]);

  const misses = guessed.filter((letter) => !card.word.includes(letter));
  const solved = card.word.split('').every((letter) => guessed.includes(letter));
  const lost = misses.length >= MAX_MISSES;
  const finished = solved || lost;
  const shown = card.word.split('').map((letter) => (guessed.includes(letter) || lost ? letter : ''));

  function guess(letter: string) {
    if (paused || finished || guessed.includes(letter)) return;
    setGuessed((current) => [...current, letter]);
    playSound(card.word.includes(letter) ? 'click' : 'wrong');
  }

  function next() {
    if (!finished) return;
    if (solved) {
      api.addScore(20 + Math.max(0, MAX_MISSES - misses.length) * 3);
      if (round % 4 === 0) api.requestGate(`Four Word Rescue mysteries solved!`);
    } else {
      api.died(`The word was ${card.word}.`);
    }
    const nextRound = round + 1;
    setRound(nextRound);
    setCard(wordForRound(band, difficulty, nextRound, restartToken));
    setGuessed([]);
  }

  return (
    <div className="absolute inset-0 overflow-y-auto bg-[radial-gradient(circle_at_50%_5%,#314a89_0,#151b3c_48%,#090d22_100%)] p-3 text-white sm:p-5">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[.22em] text-cyan-200/65">Word Rescue · Round {round}</div>
            <div className="text-lg font-black sm:text-2xl">Solve it before the storm arrives</div>
          </div>
          <div className="rounded-2xl border border-white/15 bg-black/20 px-3 py-2 text-center">
            <div className="text-xl font-black text-amber-300">{MAX_MISSES - misses.length}</div>
            <div className="text-[8px] font-black uppercase tracking-wider text-white/40">chances</div>
          </div>
        </div>

        <div className="mt-3 grid flex-1 items-center gap-3 sm:grid-cols-[.8fr_1.2fr]">
          <RescueScene misses={misses.length} />
          <div className="rounded-3xl border border-white/12 bg-white/[.055] p-4 shadow-2xl sm:p-6">
            <div className="text-center">
              {card.picture && <div className="text-5xl drop-shadow-lg">{card.picture}</div>}
              <div className="mt-1 text-[10px] font-black uppercase tracking-[.2em] text-violet-200/60">Clue</div>
              <div className="mt-1 text-sm font-bold text-white/75 sm:text-base">{card.hint}</div>
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-1.5 sm:gap-2">
              {shown.map((letter, index) => (
                <span
                  key={index}
                  className="flex h-10 min-w-8 items-center justify-center border-b-4 border-cyan-200/70 text-2xl font-black text-white sm:h-12 sm:min-w-10 sm:text-3xl"
                >
                  {letter}
                </span>
              ))}
            </div>

            {finished ? (
              <div className={`mt-5 rounded-2xl border p-4 text-center ${solved ? 'border-emerald-300/35 bg-emerald-300/10' : 'border-rose-300/35 bg-rose-300/10'}`}>
                <div className="text-xl font-black">{solved ? 'Rescue complete!' : `The word was ${card.word}`}</div>
                <button
                  type="button"
                  onClick={next}
                  disabled={paused}
                  className="mt-3 rounded-2xl bg-white px-5 py-2.5 font-black text-[#151b3c] disabled:opacity-40"
                >
                  Next word →
                </button>
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-7 gap-1.5">
                {ALPHABET.map((letter) => {
                  const used = guessed.includes(letter);
                  const hit = used && card.word.includes(letter);
                  return (
                    <button
                      key={letter}
                      type="button"
                      onClick={() => guess(letter)}
                      disabled={paused || used}
                      className={`aspect-square rounded-xl border text-sm font-black transition active:scale-90 sm:text-base ${
                        hit
                          ? 'border-emerald-300/30 bg-emerald-300/12 text-emerald-200'
                          : used
                            ? 'border-rose-300/15 bg-rose-300/[.06] text-rose-200/25'
                            : 'border-white/12 bg-white/[.06] text-white hover:bg-white/10'
                      }`}
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RescueScene({ misses }: { misses: number }) {
  const cloudX = 250 - misses * 22;
  return (
    <svg viewBox="0 0 320 320" className="mx-auto max-h-[34vh] w-full max-w-sm drop-shadow-2xl" aria-label={`Storm is ${misses} of ${MAX_MISSES} steps closer`}>
      <defs>
        <linearGradient id="rescue-island" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#65e6b4" />
          <stop offset="1" stopColor="#16876b" />
        </linearGradient>
        <filter id="rescue-glow"><feGaussianBlur stdDeviation="5" /></filter>
      </defs>
      <circle cx="70" cy="70" r="35" fill="#ffd76a" opacity=".3" filter="url(#rescue-glow)" />
      <circle cx="70" cy="70" r="24" fill="#ffe18a" />
      <path d="M20 260 Q90 210 160 254 T300 252 V320 H20Z" fill="url(#rescue-island)" />
      <path d="M0 284 Q55 260 110 284 T220 284 T330 284 V320 H0Z" fill="#168fd1" opacity=".75" />
      <g transform="translate(124 154)">
        <path d="M31 8 44 56H18Z" fill="#ffbf4f" />
        <circle cx="31" cy="18" r="12" fill="#f5ba91" />
        <path d="M20 15 Q31 -2 43 15" fill="#583929" />
        <path d="M21 57 Q31 75 42 57" fill="#fb7185" />
        <path d="M19 38 4 55M43 38 58 54" stroke="#f5ba91" strokeWidth="7" strokeLinecap="round" />
        <path d="M24 55 17 82M39 55 47 82" stroke="#31395e" strokeWidth="8" strokeLinecap="round" />
      </g>
      <g style={{ transform: `translateX(${cloudX}px)`, transition: 'transform .4s ease' }}>
        <path d="M-58 118 Q-70 85-38 78 Q-25 45 10 62 Q35 48 53 73 Q85 72 80 110Z" fill="#4c557d" />
        {Array.from({ length: Math.max(0, misses - 1) }, (_, index) => (
          <path key={index} d={`M${-45 + (index % 4) * 25} 124 l-8 23 h9 l-8 24 25-32 h-10 l9-15Z`} fill="#ffe066" />
        ))}
      </g>
      <path d="M18 260 H302" stroke="#a8f0ff" strokeWidth="3" opacity=".65" />
    </svg>
  );
}
