'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GRADE_BANDS,
  GRADE_BAND_LABELS,
  type CurriculumFamilyPreview,
  type GradeBand,
} from '@/lib/questions';
import { SUBJECT_LABELS, type Subject } from '@/lib/questions/types';
import {
  setContentDisabled,
  toggleBookmark,
  useParentContentState,
  type OverrideReason,
} from '@/lib/parentControls';
import { useProfiles } from '@/lib/profiles';

const BATCH_SIZE = 40;
type Area = 'all' | 'vocabulary' | Subject;

const AREAS: Array<{ id: Area; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'vocabulary', label: 'Vocabulary' },
  { id: 'verbal', label: 'Verbal' },
  { id: 'quantitative', label: 'Quantitative' },
  { id: 'reading', label: 'Reading' },
  { id: 'math', label: 'Math' },
];

const REASONS: Array<{ id: OverrideReason; label: string }> = [
  { id: 'too_easy', label: 'Too easy' },
  { id: 'too_hard', label: 'Too hard right now' },
  { id: 'unclear', label: 'Unclear' },
  { id: 'not_a_fit', label: 'Not a fit' },
  { id: 'already_mastered', label: 'Already mastered' },
  { id: 'other', label: 'Other' },
];

export default function ParentCurriculumLibrary({
  band,
  families,
}: {
  band: GradeBand;
  families: CurriculumFamilyPreview[];
}) {
  const router = useRouter();
  const profiles = useProfiles();
  const controls = useParentContentState();
  const [area, setArea] = useState<Area>('all');
  const [query, setQuery] = useState('');
  const [batch, setBatch] = useState(0);
  const [scope, setScope] = useState<string>('family');
  const [reason, setReason] = useState<OverrideReason>('not_a_fit');
  const targetLearner = scope === 'family' ? null : scope;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return families.filter((family) => {
      if (area === 'vocabulary' && family.kind !== 'synonym') return false;
      if (area !== 'all' && area !== 'vocabulary' && family.subject !== area) return false;
      if (!needle) return true;
      const sample = family.sample;
      return [
        sample.prompt,
        sample.explain,
        family.topic,
        ...sample.choices,
      ]
        .filter(Boolean)
        .some((text) => String(text).toLowerCase().includes(needle));
    });
  }, [area, families, query]);

  const batchCount = Math.max(1, Math.ceil(filtered.length / BATCH_SIZE));
  const safeBatch = Math.min(batch, batchCount - 1);
  const visible = filtered.slice(safeBatch * BATCH_SIZE, (safeBatch + 1) * BATCH_SIZE);
  const exactDisabled = new Set(
    controls.disabled
      .filter((item) => item.learnerId === targetLearner)
      .map((item) => item.contentKey),
  );
  const applicableDisabled = new Set(
    controls.disabled
      .filter((item) => item.learnerId === null || item.learnerId === targetLearner)
      .map((item) => item.contentKey),
  );
  const enabledCount = families.filter(
    (family) =>
      !applicableDisabled.has(family.contentKey) &&
      (!family.passageId || !applicableDisabled.has(`passage:${family.passageId}`)),
  ).length;

  function resetBatch() {
    setBatch(0);
  }

  return (
    <div>
      <section className="mb-5 rounded-2xl bg-[#151527] p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <label>
            <span className="mb-2 block text-xs font-black text-white/48">Level</span>
            <select
              value={band}
              onChange={(event) => {
                router.push(`/parent/curriculum?level=${event.target.value}`);
              }}
              className="min-h-13 w-full rounded-xl border border-white/12 bg-[#181526] px-4 text-base font-black text-white outline-none focus:border-violet-300 lg:text-sm"
            >
              {GRADE_BANDS.map((item) => (
                <option key={item} value={item}>
                  {GRADE_BAND_LABELS[item]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-2 block text-xs font-black text-white/48">Controls apply to</span>
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              className="min-h-13 w-full rounded-xl border border-white/12 bg-[#181526] px-4 text-base font-black text-white outline-none focus:border-violet-300 lg:text-sm"
            >
              <option value="family">Every child in this family</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} only
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
          <label>
            <span className="sr-only">Search curriculum</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetBatch();
              }}
              placeholder="Search a word, skill, question, or answer…"
              className="min-h-13 w-full rounded-xl border border-white/12 bg-black/20 px-4 text-base text-white outline-none placeholder:text-white/30 focus:border-cyan-200 lg:text-sm"
            />
          </label>
          <select
            aria-label="Reason used when turning off content"
            value={reason}
            onChange={(event) => setReason(event.target.value as OverrideReason)}
            className="min-h-13 rounded-xl border border-white/12 bg-[#181526] px-4 text-base font-bold text-white outline-none lg:text-sm"
          >
            {REASONS.map((item) => (
              <option key={item.id} value={item.id}>Turn-off reason: {item.label}</option>
            ))}
          </select>
        </div>
      </section>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Subject">
        {AREAS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={area === item.id}
            onClick={() => {
              setArea(item.id);
              resetBatch();
            }}
            className={`min-h-11 flex-shrink-0 rounded-xl px-4 text-xs font-black ${
              area === item.id
                ? 'bg-violet-300 text-[#171226]'
                : 'bg-white/[0.055] text-white/55 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {enabledCount <= Math.min(10, families.length) && (
        <div
          role="status"
          className={`mb-5 rounded-xl px-4 py-3 text-sm font-bold ${
            enabledCount === 0
              ? 'bg-rose-300/12 text-rose-100'
              : 'bg-amber-300/10 text-amber-100'
          }`}
        >
          {enabledCount === 0
            ? 'Every family at this level is turned off. The child app will keep a safe fallback available until at least one is restored.'
            : `Only ${enabledCount} question ${enabledCount === 1 ? 'family remains' : 'families remain'} enabled at this level.`}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/48">
          <strong className="text-white">{filtered.length}</strong> question families · showing{' '}
          {filtered.length ? safeBatch * BATCH_SIZE + 1 : 0}–
          {Math.min((safeBatch + 1) * BATCH_SIZE, filtered.length)}
        </p>
        {batchCount > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safeBatch === 0}
              onClick={() => setBatch((value) => Math.max(0, value - 1))}
              className="min-h-11 rounded-xl bg-white/[0.06] px-3 text-xs font-black text-white disabled:opacity-25"
            >
              ← Previous
            </button>
            <label className="text-xs text-white/45">
              Batch{' '}
              <select
                value={safeBatch}
                onChange={(event) => setBatch(Number(event.target.value))}
                className="min-h-11 rounded-lg bg-[#181526] px-2 py-2 font-bold text-white"
              >
                {Array.from({ length: batchCount }, (_, index) => (
                  <option key={index} value={index}>{index + 1}</option>
                ))}
              </select>{' '}
              of {batchCount}
            </label>
            <button
              type="button"
              disabled={safeBatch >= batchCount - 1}
              onClick={() => setBatch((value) => Math.min(batchCount - 1, value + 1))}
              className="min-h-11 rounded-xl bg-white/[0.06] px-3 text-xs font-black text-white disabled:opacity-25"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl bg-[#151527] p-7 text-center text-sm text-white/50">
          No questions match these filters.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((family, index) => {
            const sample = family.sample;
            const disabledHere = exactDisabled.has(family.contentKey);
            const disabledByFamily =
              targetLearner !== null &&
              !disabledHere &&
              controls.disabled.some(
                (item) => item.learnerId === null && item.contentKey === family.contentKey,
              );
            const applicable = applicableDisabled.has(family.contentKey);
            const bookmarked = controls.bookmarks.includes(family.contentKey);
            return (
              <details
                key={family.id}
                className={`group rounded-2xl bg-[#151527] shadow-[0_14px_40px_rgba(0,0,0,.2)] ${
                  applicable ? 'opacity-65' : ''
                }`}
              >
                <summary className="flex cursor-pointer list-none items-start gap-3 p-4 sm:p-5">
                  <span className="mt-0.5 flex h-8 min-w-8 items-center justify-center rounded-lg bg-white/[0.06] text-xs font-black text-white/45">
                    {safeBatch * BATCH_SIZE + index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-black text-cyan-200">
                        {family.kind === 'synonym'
                          ? 'Vocabulary'
                          : SUBJECT_LABELS[family.subject]}
                      </span>
                      <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] font-bold text-white/42">
                        {family.templated ? 'Dynamic family' : 'Fixed question'}
                      </span>
                      <span className="text-[9px] font-bold text-white/32">
                        Difficulty {family.difficulty}
                      </span>
                      {applicable && (
                        <span className="rounded-full bg-rose-300/10 px-2 py-0.5 text-[9px] font-black text-rose-200">
                          Turned off{disabledByFamily ? ' for family' : ''}
                        </span>
                      )}
                    </span>
                    <span className="mt-2 block text-sm font-bold leading-relaxed text-white sm:text-base">
                      {sample.prompt}
                    </span>
                    {family.topic && (
                      <span className="mt-1 block text-xs text-white/38">{family.topic}</span>
                    )}
                  </span>
                  <span className="text-white/35 transition group-open:rotate-180">↓</span>
                </summary>

                <div className="border-t border-white/7 px-4 pb-5 pt-4 sm:px-5">
                  {sample.passage && (
                    <div className="mb-4 max-h-52 overflow-y-auto rounded-xl bg-black/20 p-4 text-sm leading-relaxed text-white/65">
                      {sample.passage}
                    </div>
                  )}
                  <ol className="grid gap-2 sm:grid-cols-2">
                    {sample.choices.map((choice, choiceIndex) => (
                      <li
                        key={choiceIndex}
                        className={`rounded-xl px-3 py-2.5 text-sm ${
                          choiceIndex === sample.answer
                            ? 'bg-emerald-300/12 font-bold text-emerald-100'
                            : 'bg-white/[0.045] text-white/58'
                        }`}
                      >
                        {String.fromCharCode(65 + choiceIndex)}. {choice}
                      </li>
                    ))}
                  </ol>
                  <div className="mt-3 rounded-xl bg-cyan-300/[0.065] px-4 py-3">
                    <div className="text-[10px] font-black text-cyan-200">Explanation</div>
                    <p className="mt-1 text-sm leading-relaxed text-white/65">{sample.explain}</p>
                  </div>
                  {family.templated && (
                    <p className="mt-3 text-xs leading-relaxed text-white/38">
                      This is one representative example. The numbers change during practice,
                      while the underlying skill stays the same.
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => toggleBookmark(family.contentKey)}
                      className="min-h-11 rounded-xl border border-white/12 bg-white/[0.05] px-4 text-xs font-black text-white"
                    >
                      {bookmarked ? '★ Bookmarked' : '☆ Bookmark'}
                    </button>
                    <button
                      type="button"
                      disabled={disabledByFamily || (!applicable && enabledCount <= 1)}
                      onClick={() =>
                        setContentDisabled(
                          family.contentKey,
                          targetLearner,
                          !disabledHere,
                          disabledHere ? null : reason,
                        )
                      }
                      className={`min-h-11 rounded-xl px-4 text-xs font-black ${
                        disabledHere
                          ? 'bg-emerald-300/14 text-emerald-100'
                          : 'bg-rose-300/12 text-rose-100'
                      } disabled:cursor-not-allowed disabled:opacity-35`}
                    >
                      {disabledHere
                        ? 'Restore this question'
                        : !applicable && enabledCount <= 1
                          ? 'Last question stays available'
                          : 'Turn off this question'}
                    </button>
                    {family.passageId && (
                      <button
                        type="button"
                        disabled={
                          !exactDisabled.has(`passage:${family.passageId}`) && enabledCount <= 1
                        }
                        onClick={() => {
                          const key = `passage:${family.passageId}`;
                          const off = exactDisabled.has(key);
                          setContentDisabled(key, targetLearner, !off, off ? null : reason);
                        }}
                        className="min-h-11 rounded-xl bg-white/[0.05] px-4 text-xs font-black text-white/65"
                      >
                        {exactDisabled.has(`passage:${family.passageId}`)
                          ? 'Restore entire passage'
                          : enabledCount <= 1
                            ? 'Last passage stays available'
                            : 'Turn off entire passage'}
                      </button>
                    )}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
