'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  LOWER_LEVEL_FLASHCARDS,
  type LowerLevelFlashcard,
} from '@/lib/questions/lowerLevelFlashcards';
import { emptyProgress, loadProgress, type Progress } from '@/lib/progress';

type MasteryFilter = 'all' | 'new' | 'learning' | 'mastered';
type CardStatus = Exclude<MasteryFilter, 'all'>;

const STATUS_LABELS: Record<MasteryFilter, string> = {
  all: 'All words',
  new: 'New',
  learning: 'Learning',
  mastered: 'Mastered',
};

function cardStatus(card: LowerLevelFlashcard, progress: Progress): CardStatus {
  const mastery = progress.vocabulary[card.questionId];
  if (!mastery) return 'new';
  return mastery.correctStreak >= 2 && mastery.misses === 0 ? 'mastered' : 'learning';
}

export default function LowerLevelCurriculumDocument() {
  const [progress, setProgress] = useState(emptyProgress);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<MasteryFilter>('all');
  const [letter, setLetter] = useState('all');

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setProgress(loadProgress()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const sorted = useMemo(
    () => [...LOWER_LEVEL_FLASHCARDS].sort((left, right) => left.word.localeCompare(right.word)),
    [],
  );
  const letters = useMemo(
    () => [...new Set(sorted.map((card) => card.word[0].toUpperCase()))],
    [sorted],
  );
  const counts = useMemo(() => {
    const next = { new: 0, learning: 0, mastered: 0 };
    LOWER_LEVEL_FLASHCARDS.forEach((card) => {
      next[cardStatus(card, progress)] += 1;
    });
    return next;
  }, [progress]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sorted.filter((card) => {
      if (status !== 'all' && cardStatus(card, progress) !== status) return false;
      if (letter !== 'all' && card.word[0].toUpperCase() !== letter) return false;
      return !needle || card.word.includes(needle) || card.meaning.includes(needle);
    });
  }, [letter, progress, query, sorted, status]);
  const groups = useMemo(() => {
    const next = new Map<string, LowerLevelFlashcard[]>();
    filtered.forEach((card) => {
      const initial = card.word[0].toUpperCase();
      next.set(initial, [...(next.get(initial) ?? []), card]);
    });
    return [...next.entries()];
  }, [filtered]);

  function clearFilters() {
    setQuery('');
    setStatus('all');
    setLetter('all');
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl px-4 pb-16 pt-5 sm:px-8 sm:pt-9">
      <header className="border-b border-white/10 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/prep"
            className="flex min-h-11 items-center rounded-xl border border-white/14 bg-white/[.05] px-4 text-sm font-black text-white/75 transition hover:bg-white/[.09] hover:text-white"
          >
            ← Test Prep Center
          </Link>
          <Link
            href="/prep?view=word-lab"
            className="flex min-h-11 items-center rounded-xl bg-amber-200 px-4 text-sm font-black text-[#35260c] transition hover:bg-amber-100"
          >
            Study this deck →
          </Link>
        </div>
        <p className="mt-7 text-sm font-black text-amber-200">Separate Lower Level collection</p>
        <h1 className="mt-1 max-w-3xl text-3xl font-black tracking-[-.025em] text-white sm:text-5xl">
          The complete 200-word curriculum
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-white/70">
          Every word from the supplied Lower Level flashcard set is here, inside ISEE Arcade. The
          same mastery follows each learner into the flashcard deck and regular Lower Level verbal
          practice.
        </p>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold" aria-label="Vocabulary progress summary">
          <span className="text-sky-200">{counts.new} new</span>
          <span className="text-amber-200">{counts.learning} learning</span>
          <span className="text-emerald-200">{counts.mastered} mastered</span>
          <span className="text-white/55">{LOWER_LEVEL_FLASHCARDS.length} total</span>
        </div>
      </header>

      <section className="sticky top-0 z-20 -mx-4 border-b border-white/10 bg-[#0d0b18]/95 px-4 py-4 backdrop-blur sm:-mx-8 sm:px-8" aria-label="Curriculum filters">
        <label className="block">
          <span className="sr-only">Search the 200-word curriculum</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a word or meaning"
            className="min-h-12 w-full rounded-xl border border-white/14 bg-[#181526] px-4 text-base font-bold text-white outline-none placeholder:text-white/45 focus:border-violet-200"
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))]" role="group" aria-label="Filter by mastery">
          {(Object.keys(STATUS_LABELS) as MasteryFilter[]).map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={status === candidate}
              onClick={() => setStatus(candidate)}
              className={`min-h-11 rounded-xl px-3 text-sm font-black transition ${
                status === candidate
                  ? 'bg-violet-200 text-[#211939]'
                  : 'bg-white/[.06] text-white/72 hover:bg-white/[.1] hover:text-white'
              }`}
            >
              {STATUS_LABELS[candidate]}
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-3 text-sm font-bold text-white/68">
          <span className="shrink-0">Starts with</span>
          <select
            value={letter}
            onChange={(event) => setLetter(event.target.value)}
            className="min-h-11 flex-1 rounded-xl border border-white/12 bg-[#181526] px-3 text-base font-black text-white outline-none focus:border-violet-200 sm:max-w-56"
          >
            <option value="all">Any letter</option>
            {letters.map((initial) => (
              <option key={initial} value={initial}>{initial}</option>
            ))}
          </select>
        </label>
      </section>

      <div className="py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-white/62" aria-live="polite">
            Showing <strong className="text-white">{filtered.length}</strong> of 200 words
          </p>
          {(query || status !== 'all' || letter !== 'all') && (
            <button
              type="button"
              onClick={clearFilters}
              className="min-h-11 rounded-xl px-3 text-sm font-black text-violet-200 hover:bg-white/[.06]"
            >
              Clear filters
            </button>
          )}
        </div>

        {groups.length > 0 ? (
          <div className="space-y-8">
            {groups.map(([initial, cards]) => (
              <section key={initial} aria-labelledby={`curriculum-${initial}`}>
                <h2
                  id={`curriculum-${initial}`}
                  className="mb-2 border-b border-white/10 pb-2 text-2xl font-black text-violet-200"
                >
                  {initial}
                </h2>
                <ol className="divide-y divide-white/8">
                  {cards.map((card) => {
                    const cardState = cardStatus(card, progress);
                    return (
                      <li key={card.id} className="grid grid-cols-[1fr_auto] items-center gap-4 py-4">
                        <div>
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <strong className="text-lg font-black text-white">{card.word}</strong>
                            <span className="text-xs font-bold text-white/50">{card.partOfSpeech}</span>
                          </div>
                          <p className="mt-1 text-base leading-relaxed text-white/72">{card.meaning}</p>
                        </div>
                        <span
                          className={`text-xs font-black ${
                            cardState === 'mastered'
                              ? 'text-emerald-200'
                              : cardState === 'learning'
                                ? 'text-amber-200'
                                : 'text-sky-200'
                          }`}
                        >
                          {STATUS_LABELS[cardState]}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <div className="border-y border-white/10 py-12 text-center">
            <h2 className="text-xl font-black text-white">No words match those filters.</h2>
            <p className="mt-2 text-sm text-white/62">Clear the filters to return to the complete curriculum.</p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-5 min-h-11 rounded-xl bg-violet-200 px-5 text-sm font-black text-[#211939]"
            >
              Show all 200 words
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
