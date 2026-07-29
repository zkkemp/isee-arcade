'use client';

import { useMemo } from 'react';
import {
  GRADE_BAND_LABELS,
  type CurriculumFamilyPreview,
} from '@/lib/questions';
import {
  setContentDisabled,
  toggleBookmark,
  useParentContentState,
} from '@/lib/parentControls';
import { useProfileActions, useProfiles } from '@/lib/profiles';

const REASON_LABELS = {
  too_easy: 'Too easy',
  too_hard: 'Too hard right now',
  unclear: 'Unclear',
  not_a_fit: 'Not a fit',
  already_mastered: 'Already mastered',
  other: 'Other',
} as const;

export default function ParentControls({
  catalog,
}: {
  catalog: CurriculumFamilyPreview[];
}) {
  const profiles = useProfiles();
  const actions = useProfileActions();
  const controls = useParentContentState();
  const byKey = useMemo(
    () => new Map(catalog.map((family) => [family.contentKey, family])),
    [catalog],
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
      <div className="space-y-5">
        <section className="rounded-2xl bg-[#151527] p-5">
          <h2 className="text-xl font-black text-white">Smart Practice</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/50">
            When enabled, proven weak skills receive about 30% of normal question draws. The
            rest stays varied, and one isolated miss never creates a focus.
          </p>
          <div className="mt-5 divide-y divide-white/7">
            {profiles.length === 0 ? (
              <p className="py-3 text-sm text-white/45">No children have been added yet.</p>
            ) : (
              profiles.map((profile) => (
                <label key={profile.id} className="flex cursor-pointer items-center gap-4 py-4">
                  <span className="min-w-0 flex-1">
                    <span className="block font-black text-white">{profile.name}</span>
                    <span className="mt-0.5 block text-xs text-white/40">
                      {GRADE_BAND_LABELS[profile.band]}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={profile.smartPractice}
                    onChange={(event) =>
                      actions.update(profile.id, { smartPractice: event.target.checked })
                    }
                    className="h-6 w-6 accent-cyan-300"
                  />
                </label>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl bg-[#151527] p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-black text-white">Turned-off content</h2>
            <span className="text-xs text-white/35">{controls.disabled.length} rules</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-white/50">
            Nothing is deleted. Restore any question, dynamic family, or passage here.
          </p>
          <div className="mt-4 divide-y divide-white/7">
            {controls.disabled.length === 0 ? (
              <p className="py-5 text-sm text-white/42">No content has been turned off.</p>
            ) : (
              controls.disabled
                .slice()
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((item) => {
                  const passage = item.contentKey.startsWith('passage:');
                  const family = byKey.get(item.contentKey);
                  const profile = profiles.find((candidate) => candidate.id === item.learnerId);
                  return (
                    <div key={`${item.learnerId ?? 'family'}:${item.contentKey}`} className="py-4">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold leading-relaxed text-white">
                            {passage
                              ? `Reading passage ${item.contentKey.slice(8)}`
                              : family?.sample.prompt ?? item.contentKey}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-bold text-white/38">
                            <span>{profile ? `${profile.name} only` : 'Every child'}</span>
                            {item.reason && <span>· {REASON_LABELS[item.reason]}</span>}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setContentDisabled(item.contentKey, item.learnerId, false)
                          }
                          className="min-h-11 rounded-xl bg-emerald-300/12 px-3 text-xs font-black text-emerald-100"
                        >
                          Restore
                        </button>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </section>
      </div>

      <section className="self-start rounded-2xl bg-[#151527] p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-black text-white">Bookmarks</h2>
          <span className="text-xs text-white/35">{controls.bookmarks.length} saved</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-white/50">
          Keep important examples handy for a conversation or future practice set.
        </p>
        <div className="mt-4 divide-y divide-white/7">
          {controls.bookmarks.length === 0 ? (
            <p className="py-5 text-sm text-white/42">
              Bookmark questions from the Curriculum library.
            </p>
          ) : (
            controls.bookmarks.map((key) => {
              const family = byKey.get(key);
              return (
                <div key={key} className="flex items-start gap-3 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold leading-relaxed text-white">
                      {family?.sample.prompt ?? key}
                    </div>
                    {family && (
                      <div className="mt-1 text-[10px] font-bold text-white/35">
                        {family.templated ? 'Dynamic family' : 'Fixed question'}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleBookmark(key)}
                    className="min-h-11 rounded-xl bg-white/[0.06] px-3 text-xs font-black text-white/60"
                  >
                    Remove
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
