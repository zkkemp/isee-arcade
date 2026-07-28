'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { GRADE_BAND_LABELS } from '@/lib/questions';
import { loadProgressForProfile, type Progress } from '@/lib/progress';
import { useProfiles } from '@/lib/profiles';

export default function ParentOverview() {
  const profiles = useProfiles();
  const progress = useMemo<Record<string, Progress>>(
    () =>
      Object.fromEntries(
        profiles.map((profile) => [profile.id, loadProgressForProfile(profile.id)]),
      ),
    [profiles],
  );

  const totalAnswers = Object.values(progress).reduce((sum, item) => sum + item.totalSeen, 0);
  const totalCorrect = Object.values(progress).reduce((sum, item) => sum + item.totalCorrect, 0);
  const overall = totalAnswers ? Math.round((totalCorrect / totalAnswers) * 100) : 0;

  return (
    <>
      <section className="mb-7 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Children', value: profiles.length, note: 'family learners' },
          { label: 'Questions answered', value: totalAnswers, note: 'saved across practice' },
          {
            label: 'Family accuracy',
            value: totalAnswers ? `${overall}%` : '—',
            note: totalAnswers ? 'across all learners' : 'waiting for practice',
          },
        ].map((metric) => (
          <div key={metric.label} className="rounded-2xl bg-[#151527] p-5 shadow-[0_18px_50px_rgba(0,0,0,.24)]">
            <div className="text-xs font-bold text-white/42">{metric.label}</div>
            <div className="mt-2 text-3xl font-black text-white">{metric.value}</div>
            <div className="mt-1 text-xs text-white/35">{metric.note}</div>
          </div>
        ))}
      </section>

      <section className="mb-7 overflow-hidden rounded-2xl bg-[#151527] shadow-[0_18px_50px_rgba(0,0,0,.24)]">
        <div className="flex items-center justify-between gap-4 border-b border-white/8 p-5">
          <div>
            <h2 className="text-xl font-black text-white">Your children</h2>
            <p className="mt-1 text-xs text-white/45">A quick read before opening the full report.</p>
          </div>
          <Link href="/?parent=settings" className="text-xs font-black text-cyan-200">
            Manage children →
          </Link>
        </div>
        {profiles.length === 0 ? (
          <div className="p-6 text-sm text-white/50">
            No children have been added yet. Add a learner from Parent settings in the arcade.
          </div>
        ) : (
          <div className="divide-y divide-white/7">
            {profiles.map((profile) => {
              const item = progress[profile.id];
              const accuracy =
                item?.totalSeen > 0 ? Math.round((item.totalCorrect / item.totalSeen) * 100) : null;
              return (
                <div key={profile.id} className="flex flex-wrap items-center gap-4 p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-300/12 text-xl">
                    🎯
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-black text-white">{profile.name}</div>
                    <div className="mt-0.5 text-xs text-white/42">
                      {GRADE_BAND_LABELS[profile.band]}
                    </div>
                  </div>
                  <div className="text-right text-xs text-white/45">
                    <strong className="block text-base text-white">
                      {accuracy === null ? 'New' : `${accuracy}%`}
                    </strong>
                    {item?.totalSeen ?? 0} answered
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-black ${
                      profile.smartPractice
                        ? 'bg-cyan-300/12 text-cyan-100'
                        : 'bg-white/[0.06] text-white/40'
                    }`}
                  >
                    Smart Practice {profile.smartPractice ? 'on' : 'off'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            href: '/parent/reports',
            icon: '↗',
            title: 'Reports',
            text: 'See improvement, weak skills, activity, and recommended focus.',
          },
          {
            href: '/parent/curriculum',
            icon: '▤',
            title: 'Curriculum',
            text: 'Browse questions, answers, vocabulary, and dynamic families.',
          },
          {
            href: '/parent/controls',
            icon: '⚙',
            title: 'Controls',
            text: 'Manage Smart Practice, bookmarks, and disabled content.',
          },
          {
            href: '/account',
            icon: '☁',
            title: 'Family cloud',
            text: 'Sync this family or restore progress on another device.',
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-2xl bg-[#151527] p-5 shadow-[0_18px_50px_rgba(0,0,0,.24)] transition hover:-translate-y-0.5 hover:bg-[#1a1a30]"
          >
            <span className="text-2xl" aria-hidden="true">{item.icon}</span>
            <h2 className="mt-4 font-black text-white">{item.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-white/45">{item.text}</p>
          </Link>
        ))}
      </section>
    </>
  );
}
