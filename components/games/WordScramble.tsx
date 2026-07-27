'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import { useActiveProfile } from '@/lib/profiles';
import { playSound } from '@/lib/sound';
import { speak, stopSpeaking, toSpeakable } from '@/lib/speech';
import { scrambleWord, wordForRound, type WordCard } from '@/lib/wordGames';

type Phase = 'play' | 'wrong' | 'won';
type Tile = { id: number; letter: string };

export default function WordScramble({
  paused,
  api,
  restartToken,
  difficulty,
}: GameCanvasProps) {
  const profile = useActiveProfile();
  const band = profile?.band ?? 'isee';
  return (
    <WordScrambleGame
      key={`${band}-${difficulty}-${restartToken}`}
      paused={paused}
      api={api}
      restartToken={restartToken}
      difficulty={difficulty}
      band={band}
    />
  );
}

function WordScrambleGame({
  paused,
  api,
  restartToken,
  difficulty,
  band,
}: Pick<GameCanvasProps, 'paused' | 'api' | 'restartToken' | 'difficulty'> & {
  band: 'k' | 'grade1' | 'grade3' | 'isee';
}) {
  const [round, setRound] = useState(1);
  const initialCard = useMemo(
    () => wordForRound(band, difficulty, 1, restartToken + 1),
    [band, difficulty, restartToken],
  );
  const [card, setCard] = useState<WordCard>(initialCard);
  const [shuffleSeed, setShuffleSeed] = useState(1);
  const [tiles, setTiles] = useState<Tile[]>(() =>
    scrambleWord(initialCard.word, restartToken + 32).map((letter, id) => ({ id, letter })),
  );
  const [chosen, setChosen] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>('play');
  const [hints, setHints] = useState(0);

  function load(nextRound: number, salt: number) {
    const nextCard = wordForRound(band, difficulty, nextRound, salt);
    const letters = scrambleWord(nextCard.word, salt + nextRound * 31);
    setCard(nextCard);
    setTiles(letters.map((letter, id) => ({ id, letter })));
    setChosen([]);
    setPhase('play');
    setHints(0);
  }

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  const openTiles = useMemo(() => tiles.filter((tile) => !chosen.includes(tile.id)), [tiles, chosen]);

  function choose(id: number) {
    if (paused || phase !== 'play' || chosen.includes(id)) return;
    const next = [...chosen, id];
    setChosen(next);
    playSound('click');
    if (next.length === card.word.length) {
      const attempt = next.map((tileId) => tiles.find((tile) => tile.id === tileId)?.letter ?? '').join('');
      if (attempt === card.word) {
        setPhase('won');
        playSound('correct');
      } else {
        setPhase('wrong');
        playSound('wrong');
      }
    }
  }

  function undo() {
    if (paused || phase !== 'play') return;
    setChosen((current) => current.slice(0, -1));
  }

  function hint() {
    if (paused || phase !== 'play' || chosen.length >= card.word.length) return;
    const needed = card.word[chosen.length];
    const tile = openTiles.find((candidate) => candidate.letter === needed);
    if (!tile) return;
    setChosen((current) => [...current, tile.id]);
    setHints((current) => current + 1);
    playSound('pass');
  }

  function reshuffle() {
    if (paused || phase !== 'play') return;
    const nextSeed = shuffleSeed + 1;
    const letters = scrambleWord(card.word, nextSeed);
    setShuffleSeed(nextSeed);
    setTiles(letters.map((letter, id) => ({ id, letter })));
    setChosen([]);
  }

  function next() {
    if (phase !== 'won') return;
    api.addScore(Math.max(5, 25 - hints * 5));
    if (round % 5 === 0) api.requestGate(`Five scrambled words solved!`);
    const nextRound = round + 1;
    setRound(nextRound);
    const nextSeed = shuffleSeed + 17;
    setShuffleSeed(nextSeed);
    load(nextRound, nextSeed);
  }

  const levelName =
    band === 'k' ? 'Picture words' : band === 'grade1' ? 'Growing reader' : band === 'grade3' ? 'Word explorer' : 'ISEE word master';

  return (
    <div className="absolute inset-0 overflow-y-auto bg-[radial-gradient(circle_at_50%_-10%,#6844a6_0,#24204d_45%,#111329_100%)] p-3 text-white sm:p-5">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[.22em] text-fuchsia-200/65">{levelName}</div>
            <h2 className="text-xl font-black sm:text-2xl">Word Scramble · Round {round}</h2>
          </div>
          <div className="rounded-2xl border border-white/15 bg-black/20 px-3 py-2 text-center">
            <div className="text-lg font-black text-amber-300">{card.word.length}</div>
            <div className="text-[8px] font-black uppercase tracking-wider text-white/40">letters</div>
          </div>
        </div>

        <div className="mt-4 flex flex-1 flex-col justify-center rounded-[2rem] border border-white/12 bg-white/[.055] p-4 shadow-2xl sm:p-7">
          <div className="text-center">
            {card.picture && <div className="text-6xl drop-shadow-xl sm:text-7xl">{card.picture}</div>}
            <div className="mt-2 text-[10px] font-black uppercase tracking-[.18em] text-amber-100/60">Meaning clue</div>
            <div className="mx-auto mt-1 max-w-xl text-base font-bold leading-relaxed text-white/80 sm:text-lg">{card.hint}</div>
            {(band === 'k' || band === 'grade1') && (
              <button
                type="button"
                onClick={() => speak(toSpeakable(card.hint))}
                className="mt-2 rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 text-xs font-black text-white/70"
              >
                🔊 Hear the clue
              </button>
            )}
          </div>

          <div className="mt-6 flex min-h-16 flex-wrap justify-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-3">
            {Array.from({ length: card.word.length }, (_, index) => {
              const tile = tiles.find((candidate) => candidate.id === chosen[index]);
              return (
                <button
                  key={index}
                  type="button"
                  onClick={undo}
                  className={`flex h-12 w-10 items-center justify-center rounded-xl border text-2xl font-black shadow-[0_4px_0_rgba(0,0,0,.28)] sm:h-14 sm:w-12 sm:text-3xl ${
                    tile ? 'border-[#d49b31] bg-[#ffd166] text-[#281a05]' : 'border-white/20 bg-white/[.035] text-transparent'
                  }`}
                  aria-label={tile ? `Remove ${tile.letter}` : `Empty letter ${index + 1}`}
                >
                  {tile?.letter ?? '·'}
                </button>
              );
            })}
          </div>

          {phase === 'wrong' ? (
            <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-center">
              <div className="font-black text-amber-100">Good try—those letters need a new order.</div>
              <button
                type="button"
                onClick={() => {
                  setChosen([]);
                  setPhase('play');
                }}
                className="mt-3 rounded-xl bg-amber-200 px-5 py-2.5 font-black text-amber-950"
              >
                Try again
              </button>
            </div>
          ) : phase === 'won' ? (
            <div className="mt-5 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-center">
              <div className="text-2xl font-black text-emerald-100">{card.word}!</div>
              <div className="text-sm text-white/55">{card.hint}</div>
              <button type="button" onClick={next} className="mt-3 rounded-xl bg-emerald-200 px-5 py-2.5 font-black text-emerald-950">
                Next word →
              </button>
            </div>
          ) : (
            <>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {openTiles.map((tile) => (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => choose(tile.id)}
                    disabled={paused}
                    className="flex h-12 w-11 items-center justify-center rounded-xl border border-[#ffe099] bg-[#ffd166] text-2xl font-black text-[#281a05] shadow-[0_5px_0_#9a5b12] transition active:translate-y-1 active:shadow-none disabled:opacity-40 sm:h-14 sm:w-13 sm:text-3xl"
                  >
                    {tile.letter}
                  </button>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={undo} disabled={chosen.length === 0} className="rounded-xl border border-white/15 bg-white/[.05] px-4 py-2.5 text-sm font-black text-white/70 disabled:opacity-30">
                  ↶ Undo
                </button>
                <button type="button" onClick={reshuffle} className="rounded-xl border border-white/15 bg-white/[.05] px-4 py-2.5 text-sm font-black text-white/70">
                  ↻ Shuffle
                </button>
                <button type="button" onClick={hint} className="rounded-xl border border-amber-200/20 bg-amber-200/[.08] px-4 py-2.5 text-sm font-black text-amber-100">
                  💡 Place a letter
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
