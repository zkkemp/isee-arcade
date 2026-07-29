'use client';

import { useMemo, useState } from 'react';
import ParentSyncStatus from '@/components/parent/ParentSyncStatus';
import { useParentCloudRefresh } from '@/components/parent/useParentCloudRefresh';
import { smartFocusForProgress } from '@/lib/adaptivePractice';
import { GRADE_BAND_LABELS, questionById } from '@/lib/questions';
import { SUBJECT_LABELS, type QuestionKind, type Subject } from '@/lib/questions/types';
import {
  accuracy,
  loadProgressForProfile,
  type Attempt,
  type Progress,
} from '@/lib/progress';
import { useProfiles } from '@/lib/profiles';

const SUBJECTS: Subject[] = ['verbal', 'quantitative', 'reading', 'math'];
const COLORS: Record<Subject, string> = {
  verbal: '#a78bfa',
  quantitative: '#38bdf8',
  reading: '#34d399',
  math: '#fbbf24',
};
const KIND_LABELS: Record<QuestionKind, string> = {
  synonym: 'Vocabulary',
  sentence_completion: 'Sentence Completion',
  quant_reasoning: 'Quantitative Reasoning',
  math_achievement: 'Math Achievement',
  reading: 'Reading Comprehension',
};

function accuracyOf(attempts: Attempt[]): number | null {
  if (attempts.length === 0) return null;
  return Math.round((attempts.filter((attempt) => attempt.correct).length / attempts.length) * 100);
}

function trend(progress: Progress) {
  const latest = progress.history.slice(-20);
  const prior = progress.history.slice(-40, -20);
  const latestAccuracy = accuracyOf(latest);
  const priorAccuracy = accuracyOf(prior);
  return {
    latestAccuracy,
    priorAccuracy,
    change:
      latestAccuracy !== null && priorAccuracy !== null ? latestAccuracy - priorAccuracy : null,
  };
}

export default function ParentReports() {
  const profiles = useProfiles();
  const sync = useParentCloudRefresh();
  const [selectedId, setSelectedId] = useState('');
  const effectiveId = selectedId || profiles[0]?.id || '';
  const progress: Progress | null = effectiveId ? loadProgressForProfile(effectiveId) : null;
  const profile = profiles.find((item) => item.id === effectiveId) ?? null;
  const report = useMemo(() => {
    if (!progress) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    const day = 86_400_000;
    const daily = Array.from({ length: 7 }, (_, index) => {
      const start = todayStart - (6 - index) * day;
      const end = start + day;
      return {
        count: progress.history.filter((attempt) => attempt.t >= start && attempt.t < end).length,
        label: new Date(start).toLocaleDateString(undefined, { weekday: 'narrow' }),
      };
    });
    const weak = smartFocusForProgress(progress);
    const skillRows = new Map<string, { kind: QuestionKind; seen: number; correct: number }>();
    progress.history.slice(-120).forEach((attempt) => {
      const kind = questionById(attempt.id)?.kind;
      if (!kind) return;
      const row = skillRows.get(kind) ?? { kind, seen: 0, correct: 0 };
      row.seen += 1;
      if (attempt.correct) row.correct += 1;
      skillRows.set(kind, row);
    });
    const skills = [...skillRows.values()]
      .filter((row) => row.seen >= 3)
      .map((row) => ({ ...row, accuracy: Math.round((row.correct / row.seen) * 100) }))
      .sort((a, b) => a.accuracy - b.accuracy);
    return {
      daily,
      weak,
      skills,
      trend: trend(progress),
      knownWords: Object.values(progress.vocabulary).filter((word) => word.correctStreak >= 2).length,
      learningWords: Object.values(progress.vocabulary).filter(
        (word) => word.correctStreak < 2 || word.misses > 0,
      ).length,
    };
  }, [progress]);

  if (profiles.length === 0) {
    return (
      <div className="rounded-2xl bg-[#151527] p-6 text-sm text-white/55">
        Add a child from Children &amp; sign-ins before opening reports.
      </div>
    );
  }

  if (!profile || !progress || !report) return <div className="text-white/45">Loading report…</div>;

  const overall = progress.totalSeen
    ? Math.round((progress.totalCorrect / progress.totalSeen) * 100)
    : null;
  const maxDay = Math.max(1, ...report.daily.map((item) => item.count));

  return (
    <div>
      <ParentSyncStatus
        refreshing={sync.refreshing}
        updatedAt={sync.updatedAt}
        error={sync.error}
        onRefresh={sync.refresh}
      />

      <label className="mb-6 block max-w-lg">
        <span className="mb-2 block text-xs font-black text-white/50">Report for</span>
        <select
          value={effectiveId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="min-h-14 w-full rounded-xl border border-white/12 bg-[#181526] px-4 text-base font-black text-white outline-none focus:border-violet-300"
        >
          {profiles.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} — {GRADE_BAND_LABELS[item.band]}
            </option>
          ))}
        </select>
      </label>

      {progress.totalSeen === 0 ? (
        <section className="rounded-2xl bg-[#151527] p-7">
          <h2 className="text-xl font-black text-white">The report starts after practice</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/50">
            {profile.name} has not answered a question yet. Games, test-prep sections, vocabulary,
            and study blocks will all feed this report.
          </p>
        </section>
      ) : (
        <>
          <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Answered', value: progress.totalSeen, note: 'recorded attempts' },
              { label: 'Accuracy', value: `${overall}%`, note: 'all-time' },
              {
                label: 'Recent change',
                value:
                  report.trend.change === null
                    ? 'Learning'
                    : `${report.trend.change > 0 ? '+' : ''}${report.trend.change}%`,
                note:
                  report.trend.change === null
                    ? 'more data needed'
                    : 'last 20 vs previous 20',
              },
              {
                label: 'Vocabulary known',
                value: report.knownWords,
                note: `${report.learningWords} still learning`,
              },
            ].map((metric) => (
              <div key={metric.label} className="rounded-2xl bg-[#151527] p-5">
                <div className="text-xs font-bold text-white/42">{metric.label}</div>
                <div className="mt-2 text-3xl font-black text-white">{metric.value}</div>
                <div className="mt-1 text-xs text-white/35">{metric.note}</div>
              </div>
            ))}
          </section>

          <section className="mb-5 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
            <div className="rounded-2xl bg-[#151527] p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-black text-white">Last seven days</h2>
                <span className="text-xs text-white/35">questions answered</span>
              </div>
              <div className="mt-6 flex h-40 items-end gap-2" aria-label="Seven-day activity chart">
                {report.daily.map((item, index) => {
                  return (
                    <div key={index} className="flex h-full flex-1 flex-col justify-end gap-2 text-center">
                      <span className="text-[10px] font-bold text-white/45">{item.count}</span>
                      <div
                        className="min-h-1 rounded-t-lg bg-violet-300"
                        style={{ height: `${Math.max(4, (item.count / maxDay) * 112)}px` }}
                      />
                      <span className="text-[10px] text-white/35">
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl bg-[#151527] p-5">
              <h2 className="text-lg font-black text-white">Recommended focus</h2>
              {report.weak ? (
                <>
                  <div className="mt-4 text-2xl font-black text-cyan-200">
                    {report.weak.topic
                      ? report.weak.topic
                      : report.weak.kind
                        ? KIND_LABELS[report.weak.kind]
                      : SUBJECT_LABELS[report.weak.subject]}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-white/52">
                    {profile.name} is at {Math.round(report.weak.accuracy * 100)}% across the most
                    recent {report.weak.attempts} questions in this lane. Smart Practice will use
                    this focus for only part of the mix.
                  </p>
                  <div className="mt-4 rounded-xl bg-cyan-300/[0.07] px-4 py-3 text-xs font-bold text-cyan-100">
                    Smart Practice is {profile.smartPractice ? 'on' : 'off'} for {profile.name}.
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm leading-relaxed text-white/50">
                  No reliable weak area yet. The app will keep the practice mix broad until at
                  least four attempts reveal a pattern.
                </p>
              )}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl bg-[#151527] p-5">
              <h2 className="text-lg font-black text-white">By subject</h2>
              <div className="mt-4 space-y-4">
                {SUBJECTS.map((subject) => {
                  const stat = progress.bySubject[subject];
                  const value = accuracy(stat);
                  return (
                    <div key={subject}>
                      <div className="mb-2 flex justify-between gap-3 text-sm">
                        <span className="font-bold text-white">{SUBJECT_LABELS[subject]}</span>
                        <span className="text-white/45">
                          {stat.seen ? `${value}% · ${stat.seen} questions` : 'Not started'}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/8">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${stat.seen ? value : 0}%`, background: COLORS[subject] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl bg-[#151527] p-5">
              <h2 className="text-lg font-black text-white">Skill detail</h2>
              <p className="mt-1 text-xs text-white/38">Lowest recent accuracy appears first.</p>
              <div className="mt-4 divide-y divide-white/7">
                {report.skills.length === 0 ? (
                  <div className="py-3 text-sm text-white/45">More attempts are needed.</div>
                ) : (
                  report.skills.map((skill) => (
                    <div key={skill.kind} className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <div className="text-sm font-bold text-white">{KIND_LABELS[skill.kind]}</div>
                        <div className="text-xs text-white/35">{skill.seen} recent attempts</div>
                      </div>
                      <div
                        className={`text-lg font-black ${
                          skill.accuracy < 65
                            ? 'text-amber-200'
                            : skill.accuracy >= 85
                              ? 'text-emerald-200'
                              : 'text-white'
                        }`}
                      >
                        {skill.accuracy}%
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
