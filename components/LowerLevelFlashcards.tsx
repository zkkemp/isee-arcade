'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  LOWER_LEVEL_FLASHCARDS,
  pickLowerLevelFlashcard,
  type LowerLevelFlashcard,
} from '@/lib/questions/lowerLevelFlashcards';
import { emptyProgress, loadProgress, recordAnswer, saveProgress, type Progress } from '@/lib/progress';

type DeckView = 'study' | 'library';
type LibraryFilter = 'all' | 'new' | 'learning' | 'mastered';
type CardStatus = Exclude<LibraryFilter, 'all'>;

function cardStatus(card: LowerLevelFlashcard, progress: Progress): CardStatus {
  const mastery = progress.vocabulary[card.questionId];
  if (!mastery) return 'new';
  if (mastery.correctStreak >= 2 && mastery.misses === 0) return 'mastered';
  return 'learning';
}

function statusLabel(status: LibraryFilter): string {
  return status === 'new' ? 'New' : status === 'learning' ? 'Learning' : status === 'mastered' ? 'Mastered' : 'All';
}

export default function LowerLevelFlashcards({ onExit }: { onExit: () => void }) {
  const [progress, setProgress] = useState(emptyProgress);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [card, setCard] = useState(LOWER_LEVEL_FLASHCARDS[0]);
  const [revealed, setRevealed] = useState(false);
  const [view, setView] = useState<DeckView>('study');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [query, setQuery] = useState('');
  const [session, setSession] = useState({ reviewed: 0, known: 0 });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = loadProgress();
      setProgress(saved);
      setCard(pickLowerLevelFlashcard(saved.vocabulary, saved.totalSeen));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function scrollToWordLab() {
    document.getElementById('lower-level-word-lab')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  const counts = useMemo(() => {
    const next = { new: 0, learning: 0, mastered: 0 };
    LOWER_LEVEL_FLASHCARDS.forEach((candidate) => {
      next[cardStatus(candidate, progress)] += 1;
    });
    return next;
  }, [progress]);

  const library = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return LOWER_LEVEL_FLASHCARDS.filter((candidate) => {
      if (filter !== 'all' && cardStatus(candidate, progress) !== filter) return false;
      return !needle || candidate.word.includes(needle) || candidate.meaning.includes(needle);
    });
  }, [filter, progress, query]);

  function openCard(next: LowerLevelFlashcard) {
    setCard(next);
    setRevealed(false);
    setView('study');
    scrollToWordLab();
  }

  function rateCard(known: boolean) {
    const nextProgress = recordAnswer(progress, {
      id: card.questionId,
      subject: 'verbal',
      correct: known,
      vocabulary: true,
    });
    saveProgress(nextProgress);
    const nextRecent = [...recentIds, card.questionId].slice(-8);
    setProgress(nextProgress);
    setRecentIds(nextRecent);
    setSession((current) => ({
      reviewed: current.reviewed + 1,
      known: current.known + (known ? 1 : 0),
    }));
    setCard(
      pickLowerLevelFlashcard(
        nextProgress.vocabulary,
        nextProgress.totalSeen,
        nextRecent,
      ),
    );
    setRevealed(false);
  }

  const currentStatus = cardStatus(card, progress);
  const mastery = progress.vocabulary[card.questionId];

  return (
    <section
      id="lower-level-word-lab"
      className="scroll-mt-3 overflow-hidden rounded-[2rem] border border-violet-300/20 bg-[#141326] shadow-[0_24px_70px_rgba(0,0,0,.35)]"
    >
      <header className="border-b border-white/10 bg-[#1a1730] px-4 py-4 sm:px-7 sm:py-5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onExit}
            className="min-h-11 rounded-xl border border-white/15 px-3 text-sm font-bold text-white/72 transition hover:bg-white/[.07] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-200"
          >
            ← Back
          </button>
          <div className="text-right">
            <h2 className="text-lg font-black text-white sm:text-2xl">Lower Level Word Lab</h2>
            <p className="text-xs text-violet-100/62">200 words from the complete source deck</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2" aria-label="Vocabulary progress">
          {([
            ['New', counts.new, 'text-sky-200'],
            ['Learning', counts.learning, 'text-amber-200'],
            ['Mastered', counts.mastered, 'text-emerald-200'],
          ] as const).map(([label, value, tone]) => (
            <div key={label} className="bg-black/20 px-3 py-2 text-center">
              <strong className={`block text-xl font-black tabular-nums ${tone}`}>{value}</strong>
              <span className="text-[11px] font-bold text-white/58">{label}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2" role="tablist" aria-label="Word Lab views">
          {(['study', 'library'] as DeckView[]).map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={view === candidate}
              onClick={() => setView(candidate)}
              className={`min-h-11 rounded-xl text-sm font-black transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-200 ${
                view === candidate
                  ? 'bg-violet-200 text-[#211939]'
                  : 'bg-white/[.055] text-white/70 hover:bg-white/[.09]'
              }`}
            >
              {candidate === 'study' ? 'Study deck' : 'Browse all words'}
            </button>
          ))}
        </div>
        <Link
          href="/prep/lower-level-vocabulary"
          className="mt-2 flex min-h-11 items-center justify-center rounded-xl border border-white/12 bg-white/[.045] px-4 text-sm font-black text-white/72 transition hover:bg-white/[.08] hover:text-white"
        >
          Open the complete 200-word curriculum →
        </Link>
      </header>

      {view === 'study' ? (
        <div className="px-4 py-6 sm:px-8 sm:py-9">
          <div className="mx-auto max-w-2xl">
            <div className="mb-3 flex items-center justify-between gap-3 text-xs font-bold">
              <span className="text-white/52">
                {statusLabel(currentStatus)}
                {mastery?.misses ? ` · ${mastery.misses} review${mastery.misses === 1 ? '' : 's'} owed` : ''}
              </span>
              <span className="tabular-nums text-white/42">
                This visit: {session.known}/{session.reviewed} knew it
              </span>
            </div>

            <button
              type="button"
              onClick={() => setRevealed(true)}
              disabled={revealed}
              aria-label={revealed ? `${card.word} means ${card.meaning}` : `Reveal the meaning of ${card.word}`}
              className={`relative flex min-h-[340px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl px-6 py-10 text-center shadow-[0_18px_45px_rgba(0,0,0,.28)] transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-200 sm:min-h-[410px] ${
                revealed
                  ? 'bg-[#f7f0cf] text-[#2b2540]'
                  : 'bg-violet-200 text-[#231a3b] hover:bg-violet-100'
              }`}
            >
              <span className="absolute left-5 top-5 text-xs font-black text-current/45">
                {card.partOfSpeech}
              </span>
              <strong className="max-w-full break-words text-4xl font-black tracking-[-.025em] sm:text-6xl">
                {card.word}
              </strong>
              {revealed ? (
                <span className="mt-9 border-t border-current/15 pt-7">
                  <span className="block text-xs font-black text-current/48">Closest meaning</span>
                  <span className="mt-2 block text-3xl font-black sm:text-4xl">{card.meaning}</span>
                </span>
              ) : (
                <span className="mt-8 text-sm font-bold text-current/58">Tap to reveal the meaning</span>
              )}
            </button>

            {revealed ? (
              <div className="mt-4 grid grid-cols-2 gap-3" aria-label="Rate this word">
                <button
                  type="button"
                  onClick={() => rateCard(false)}
                  className="min-h-16 rounded-xl border border-amber-200/30 bg-amber-200/[.09] px-3 text-base font-black text-amber-100 transition hover:bg-amber-200/[.15] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
                >
                  Still learning
                </button>
                <button
                  type="button"
                  onClick={() => rateCard(true)}
                  className="min-h-16 rounded-xl bg-emerald-300 px-3 text-base font-black text-[#123227] transition hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-100"
                >
                  I knew it
                </button>
              </div>
            ) : (
              <p className="mt-4 text-center text-sm leading-relaxed text-white/58">
                Say the meaning out loud before revealing it. Missed words return quickly; two
                successful reviews move a word into Mastered.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="px-4 py-5 sm:px-7 sm:py-7">
          <label className="block">
            <span className="sr-only">Search all flashcard words</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a word or meaning"
              className="min-h-12 w-full rounded-xl border border-white/14 bg-black/25 px-4 text-base font-bold text-white outline-none placeholder:text-white/35 focus:border-violet-200"
            />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Filter words">
            {(['all', 'new', 'learning', 'mastered'] as LibraryFilter[]).map((candidate) => (
              <button
                key={candidate}
                type="button"
                aria-pressed={filter === candidate}
                onClick={() => setFilter(candidate)}
                className={`min-h-11 rounded-xl px-3 text-sm font-black transition ${
                  filter === candidate
                    ? 'bg-violet-200 text-[#211939]'
                    : 'bg-white/[.055] text-white/65 hover:bg-white/[.09]'
                }`}
              >
                {statusLabel(candidate)}
              </button>
            ))}
          </div>

          <p className="mt-4 text-xs font-bold text-white/48">{library.length} words shown</p>
          {library.length > 0 ? (
            <div className="mt-2 divide-y divide-white/8 border-y border-white/10">
              {library.map((candidate) => {
                const status = cardStatus(candidate, progress);
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => openCard(candidate)}
                    className="flex min-h-16 w-full items-center justify-between gap-4 px-2 py-3 text-left transition hover:bg-white/[.045] focus-visible:outline-2 focus-visible:outline-violet-200"
                  >
                    <span>
                      <strong className="block text-base font-black text-white">{candidate.word}</strong>
                      <span className="mt-0.5 block text-xs text-white/48">
                        {candidate.partOfSpeech} · {candidate.meaning}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-xs font-black ${
                        status === 'mastered'
                          ? 'text-emerald-200'
                          : status === 'learning'
                            ? 'text-amber-200'
                            : 'text-sky-200'
                      }`}
                    >
                      {statusLabel(status)} →
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 border-y border-white/10 py-10 text-center">
              <p className="font-black text-white">No words match that search.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
                className="mt-3 min-h-11 rounded-xl bg-white/10 px-4 text-sm font-black text-white"
              >
                Show all 200 words
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
