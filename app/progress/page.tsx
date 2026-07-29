'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GAME_LIST } from '@/lib/games';
import { questionById } from '@/lib/questions';
import { SUBJECT_LABELS, type Subject } from '@/lib/questions/types';
import {
  accuracy,
  emptyProgress,
  loadProgress,
  resetProgress,
  type Progress,
} from '@/lib/progress';

const SUBJECT_ORDER: Subject[] = ['verbal', 'quantitative', 'reading', 'math'];

const SUBJECT_COLORS: Record<Subject, string> = {
  verbal: '#a78bfa',
  quantitative: '#4ea8ff',
  reading: '#3ddc84',
  math: '#ffb84e',
};

const SUBJECT_ICONS: Record<Subject, string> = {
  verbal: '💬',
  quantitative: '🔢',
  reading: '📚',
  math: '✦',
};

export default function ProgressPage() {
  const [p, setP] = useState<Progress | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setP(loadProgress());
  }, []);

  if (!p) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10 text-sm text-white/40">Loading…</main>
    );
  }

  const overall = p.totalSeen === 0 ? 0 : Math.round((p.totalCorrect / p.totalSeen) * 100);
  const reviewIds = Object.keys(p.missed);
  // Newest first, and only one row per question even if it was missed twice.
  const recent = [...p.history].reverse().slice(0, 15);
  const practiced = SUBJECT_ORDER.filter((subject) => p.bySubject[subject].seen > 0);
  const focusSubject =
    practiced.length > 0
      ? [...practiced].sort(
          (a, b) => accuracy(p.bySubject[a]) - accuracy(p.bySubject[b]),
        )[0]
      : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-12 pt-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white/70 transition hover:bg-white/10"
          aria-label="Back to game list"
        >
          ←
        </Link>
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300/70">
            Learner dashboard
          </div>
          <h1 className="text-2xl font-black text-white">Progress & practice</h1>
        </div>
      </div>

      {p.totalSeen === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <p className="text-white/60">No questions answered yet.</p>
          <Link
            href="/"
            className="mt-3 inline-block rounded-xl bg-[#a78bfa] px-5 py-2.5 text-sm font-bold text-[#101020]"
          >
            Play a game
          </Link>
        </div>
      ) : (
        <>
          {/* Headline numbers */}
          <div className="mb-4 grid grid-cols-3 gap-3">
            {[
              { label: 'answered', value: p.totalSeen, color: '#fff', icon: '✦' },
              { label: 'correct', value: `${overall}%`, color: '#3ddc84', icon: '✓' },
              { label: 'best streak', value: p.bestStreak, color: '#ffb84e', icon: '🔥' },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.025] p-3 text-center shadow-xl"
              >
                <div className="mb-1 text-sm opacity-70" aria-hidden="true">{s.icon}</div>
                <div className="text-2xl font-bold" style={{ color: s.color }}>
                  {s.value}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-white/40">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {focusSubject && (
            <div
              className="mb-6 flex items-center gap-3 rounded-3xl border p-4"
              style={{
                borderColor: `${SUBJECT_COLORS[focusSubject]}35`,
                background: `linear-gradient(110deg, ${SUBJECT_COLORS[focusSubject]}16, rgba(255,255,255,.025))`,
              }}
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-black/20 text-2xl">
                {SUBJECT_ICONS[focusSubject]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/40">
                  Suggested focus
                </div>
                <div className="font-black text-white">{SUBJECT_LABELS[focusSubject]}</div>
                <div className="text-xs text-white/50">
                  This is the best place for the next little confidence boost.
                </div>
              </div>
              <Link
                href="/"
                className="flex-shrink-0 rounded-2xl bg-white/10 px-3 py-2 text-xs font-bold text-white/80"
              >
                Play →
              </Link>
            </div>
          )}

          {/* By subject */}
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">
            By subject
          </h2>
          <div className="mb-6 space-y-2">
            {SUBJECT_ORDER.map((s) => {
              const stat = p.bySubject[s];
              const pct = accuracy(stat);
              return (
                <div key={s} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-bold text-white">
                      <span aria-hidden="true">{SUBJECT_ICONS[s]}</span>
                      {SUBJECT_LABELS[s]}
                    </span>
                    <span className="text-xs text-white/50">
                      {stat.seen === 0 ? 'not started' : `${stat.correct}/${stat.seen} · ${pct}%`}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${stat.seen === 0 ? 0 : pct}%`,
                        background: SUBJECT_COLORS[s],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Needs review */}
          {reviewIds.length > 0 && (
            <>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
                Needs review ({reviewIds.length})
              </h2>
              <p className="mb-3 text-xs text-white/40">
                These come back in future games until the learner gets them right.
              </p>
              <ul className="mb-6 space-y-2">
                {reviewIds.slice(0, 12).map((id) => {
                  const q = questionById(id);
                  if (!q) return null;
                  return (
                    <li
                      key={id}
                      className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3"
                    >
                      <div
                        className="mb-1 text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: SUBJECT_COLORS[q.subject] }}
                      >
                        {SUBJECT_LABELS[q.subject]}
                      </div>
                      <div className="whitespace-pre-line text-sm text-white/85">{q.prompt}</div>
                      <div className="mt-1 text-xs text-emerald-300/90">
                        Answer: {q.choices[q.answer]}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {/* High scores */}
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">
            High scores
          </h2>
          <div className="mb-6 grid gap-2 sm:grid-cols-2">
            {GAME_LIST.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
              >
                <span className="text-sm text-white/80">
                  {g.icon} {g.name}
                </span>
                <span className="text-sm font-bold" style={{ color: g.accent }}>
                  {p.highScores[g.id] ?? 0}
                </span>
              </div>
            ))}
          </div>

          {/* Recent */}
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">
            Last {recent.length} questions
          </h2>
          <div className="mb-8 flex flex-wrap gap-1.5">
            {recent.map((a, i) => (
              <span
                key={`${a.id}-${a.t}-${i}`}
                title={`${SUBJECT_LABELS[a.subject]} — ${a.correct ? 'correct' : 'missed'}`}
                className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${
                  a.correct
                    ? 'bg-emerald-400/15 text-emerald-300'
                    : 'bg-rose-400/15 text-rose-300'
                }`}
              >
                {a.correct ? '✓' : '✕'}
              </span>
            ))}
          </div>

          {/* Reset */}
          {confirming ? (
            <div className="rounded-2xl border border-rose-400/30 bg-rose-400/[0.06] p-4">
              <p className="mb-3 text-sm text-white/80">
                Erase all progress, scores, and review history on this device? This cannot be
                undone.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetProgress();
                    setP(emptyProgress());
                    setConfirming(false);
                  }}
                  className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-bold text-white"
                >
                  Yes, erase it
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/70"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-xs text-white/30 underline hover:text-white/60"
            >
              Reset all progress
            </button>
          )}
        </>
      )}
    </main>
  );
}
