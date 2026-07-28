'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import CharacterFace from './CharacterFace';
import { CHARACTERS, getCharacter, type CharacterId } from '@/lib/characters';
import {
  GRADE_BAND_BLURBS,
  GRADE_BAND_LABELS,
  GENERIC_GRADE_BANDS,
  ISEE_GRADE_BANDS,
  type GradeBand,
} from '@/lib/questions';
import {
  useActiveProfile,
  useMasterExists,
  useProfileActions,
  useProfiles,
  type Profile,
} from '@/lib/profiles';
import { setPlayerMode, usePlayerMode } from '@/lib/playerMode';

/**
 * Who is playing.
 *
 * Each kid is a local profile with a grade band (which question bank they get),
 * an avatar and password. A parent can reset a forgotten child password and
 * control daily time and study-block length. Profiles remain local-first and
 * mirror to the signed-in family cloud when it is connected.
 */

type View = 'closed' | 'choose' | 'login' | 'create' | 'parent' | 'parentUnlock';

const ACCENT = '#a78bfa';

export default function ProfileGate() {
  const profiles = useProfiles();
  const active = useActiveProfile();
  const masterExists = useMasterExists();
  const actions = useProfileActions();
  const playerMode = usePlayerMode();

  // Open straight to the chooser when nobody is signed in yet.
  const [view, setView] = useState<View>('closed');
  // True once the parent has unlocked a switch this session, so the chooser can
  // activate a player directly instead of re-asking for that kid's own passcode.
  const [unlocked, setUnlocked] = useState(false);
  const open = view !== 'closed';
  const showChooser = open || (!active && playerMode !== 'parent');

  // Parent-center links can return directly to the existing settings panel.
  // This extends the original parent side instead of duplicating child setup in
  // a second place.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('parent') !== 'settings') return;
    const openTimer = window.setTimeout(() => setView('parent'), 0);
    params.delete('parent');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    return () => window.clearTimeout(openTimer);
  }, []);

  /**
   * Switching to a DIFFERENT player is gated behind the parent passcode, so a kid
   * cannot hop to an easier grade's questions to coast through the study block.
   * - Nobody signed in yet (first setup): open the chooser freely.
   * - Someone signed in but no parent code set yet: force creating one first - it
   *   is the lock, so without it there is nothing stopping a switch.
   * - Otherwise: ask for the parent code, then reveal the chooser.
   */
  const onSwitch = () => {
    if (open) {
      setView('closed');
      setUnlocked(false);
      return;
    }
    if (!active) {
      setView('choose');
      return;
    }
    if (!masterExists) {
      setView('parent');
      return;
    }
    setView('parentUnlock');
  };

  return (
    <div className="mb-5">
      {/* Signed-in bar */}
      <div className="flex items-center gap-3 rounded-3xl border border-violet-300/15 bg-gradient-to-br from-violet-300/[0.09] to-white/[0.025] p-4 shadow-xl">
        {playerMode === 'parent' ? (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-300/14 text-2xl">
              🧭
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-black text-white">Parent sandbox</div>
              <div className="mt-0.5 text-xs font-semibold text-amber-200">
                Unlimited play · child progress stays untouched
              </div>
            </div>
            <Link
              href="/parent"
              className="rounded-xl bg-amber-300 px-3 py-2.5 text-sm font-black text-[#211704]"
            >
              Parent center
            </Link>
          </>
        ) : active ? (
          <>
            <CharacterFace character={getCharacter(active.avatarId)} size={44} className="rounded-xl" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-black text-white">{active.name}</div>
              <div className="mt-0.5 text-xs font-semibold" style={{ color: ACCENT }}>
                {GRADE_BAND_LABELS[active.band]} questions
              </div>
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1 text-sm text-white/60">
            Pick who is playing to get the right questions.
          </div>
        )}
        <button
          type="button"
          onClick={onSwitch}
          className="flex-shrink-0 rounded-2xl border border-white/15 bg-white/[0.07] px-3.5 py-2.5 text-sm font-bold text-white/80 transition hover:bg-white/10 active:scale-95"
        >
          {playerMode === 'parent'
            ? open
              ? 'Close'
              : 'Choose child'
            : active
              ? open
                ? 'Close'
                : 'Switch player'
              : 'Choose player'}
        </button>
      </div>

      {showChooser && (
        <div className="mt-3 rounded-3xl border border-white/10 bg-[#121020]/90 p-4 shadow-2xl">
          {view === 'parentUnlock' ? (
            <ParentUnlockPanel
              actions={actions}
              back={() => setView('closed')}
              onDone={() => {
                setUnlocked(true);
                setView('choose');
              }}
            />
          ) : view === 'login' ? (
            <LoginPanel actions={actions} back={() => setView('choose')} onDone={() => setView('closed')} />
          ) : view === 'create' ? (
            <CreatePanel actions={actions} back={() => setView('choose')} onDone={() => setView('closed')} />
          ) : view === 'parent' ? (
            <ParentPanel
              actions={actions}
              profiles={profiles}
              masterExists={masterExists}
              back={() => setView('closed')}
            />
          ) : (
            <ChoosePanel
              profiles={profiles}
              // After a parent unlock, activate directly (the parent is choosing).
              // During first setup, still honor a kid's own passcode if they set one.
              onPick={(p) => {
                if (!unlocked && p.passcodeHash) {
                  pendingRef.selected = p;
                  setView('login');
                } else {
                  actions.setActive(p.id);
                  setUnlocked(false);
                  setView('closed');
                }
              }}
              onAdd={() => setView('create')}
              onParent={() => setView('parent')}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Parent-passcode prompt shown before the player chooser, to block self-switching. */
function ParentUnlockPanel({
  actions,
  back,
  onDone,
}: {
  actions: Actions;
  back: () => void;
  onDone: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="mx-auto max-w-xs text-center">
      <div className="text-2xl">🔒</div>
      <div className="mt-1 font-bold text-white">Parent password to switch</div>
      <div className="mb-3 text-xs text-white/50">
        Only a parent can change who is playing, so kids can&apos;t switch to easier questions.
      </div>
      <PasscodeInput value={code} onChange={(v) => { setCode(v); setError(false); }} placeholder="••••" />
      {error && <div className="mt-2 text-xs font-semibold text-rose-400">Wrong password.</div>}
      <button
        type="button"
        disabled={busy || code.length === 0}
        onClick={async () => {
          setBusy(true);
          const ok = await actions.verifyMaster(code);
          setBusy(false);
          if (ok) onDone();
          else { setError(true); setCode(''); }
        }}
        className="mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-bold text-[#101020] disabled:opacity-40"
        style={{ background: ACCENT }}
      >
        Unlock
      </button>
      <BackRow label="Cancel" back={back} />
    </div>
  );
}

// A tiny module-scoped hand-off so the login panel knows which profile was tapped
// without threading it through view state. Only ever read right after it is set.
const pendingRef: { selected: Profile | null } = { selected: null };

type Actions = ReturnType<typeof useProfileActions>;

function ChoosePanel({
  profiles,
  onPick,
  onAdd,
  onParent,
}: {
  profiles: Profile[];
  onPick: (p: Profile) => void;
  onAdd: () => void;
  onParent: () => void;
}) {
  return (
    <div>
      <div className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">
        Who is playing?
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-white/25 active:scale-95"
          >
            <CharacterFace character={getCharacter(p.avatarId)} size={56} />
            <span className="max-w-full truncate text-sm font-bold text-white">{p.name}</span>
            <span className="text-[11px]" style={{ color: ACCENT }}>
              {GRADE_BAND_LABELS[p.band]}
              {p.passcodeHash ? ' · 🔒' : ''}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={onAdd}
          className="flex min-h-[7.5rem] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-white/15 p-3 text-white/60 transition hover:border-white/30 active:scale-95"
        >
          <span className="text-3xl">＋</span>
          <span className="text-sm font-semibold">Add player</span>
        </button>
      </div>
      <button
        type="button"
        onClick={onParent}
        className="mt-3 text-xs font-semibold text-white/40 underline hover:text-white/70"
      >
        Parent settings
      </button>
    </div>
  );
}

function PasscodeInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="password"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32))}
      autoComplete="new-password"
      placeholder={placeholder}
      className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-center text-lg font-bold tracking-[0.12em] text-white outline-none focus:border-white/40"
    />
  );
}

function LoginPanel({ actions, back, onDone }: { actions: Actions; back: () => void; onDone: () => void }) {
  const profile = pendingRef.selected;
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!profile) {
    return <BackRow label="Pick a player" back={back} />;
  }

  const submit = async () => {
    setBusy(true);
    const ok = await actions.verifyPasscode(profile, code);
    setBusy(false);
    if (ok) {
      actions.setActive(profile.id);
      onDone();
    } else {
      setError(true);
      setCode('');
    }
  };

  return (
    <div className="mx-auto max-w-xs text-center">
      <CharacterFace character={getCharacter(profile.avatarId)} size={64} className="mx-auto" />
      <div className="mt-2 font-bold text-white">{profile.name}</div>
      <div className="mb-3 text-xs text-white/50">Enter your password to play</div>
      <PasscodeInput value={code} onChange={(v) => { setCode(v); setError(false); }} placeholder="••••" />
      {error && <div className="mt-2 text-xs font-semibold text-rose-400">Wrong password. Try again.</div>}
      <button
        type="button"
        disabled={busy || code.length === 0}
        onClick={submit}
        className="mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-bold text-[#101020] disabled:opacity-40"
        style={{ background: ACCENT }}
      >
        Play
      </button>
      <BackRow label="Back" back={back} />
    </div>
  );
}

function CreatePanel({ actions, back, onDone }: { actions: Actions; back: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [band, setBand] = useState<GradeBand>('grade3');
  const [avatarId, setAvatarId] = useState<CharacterId>('dakota');
  const [code, setCode] = useState('');
  const [dailyLimitMinutes, setDailyLimitMinutes] = useState(30);
  const [questionBlockSize, setQuestionBlockSize] = useState(8);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || !username.trim() || code.length < 6) return;
    setBusy(true);
    const profile = actions.add({
      name,
      username,
      band,
      avatarId,
      dailyLimitMinutes,
      questionBlockSize,
    });
    await actions.setPasscode(profile.id, code);
    actions.setActive(profile.id);
    setBusy(false);
    onDone();
  };

  return (
    <div>
      <div className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">Add a player</div>

      <label className="mb-1 block text-xs font-semibold text-white/50">Name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z ]/g, '').slice(0, 16))}
        placeholder="Display name"
        className="mb-3 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 font-bold text-white outline-none focus:border-white/40"
      />

      <label className="mb-1 block text-xs font-semibold text-white/50">Username</label>
      <input
        value={username}
        onChange={(e) =>
          setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24))
        }
        autoCapitalize="none"
        autoComplete="username"
        placeholder="marty"
        className="mb-3 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 font-bold text-white outline-none focus:border-white/40"
      />

      <label className="mb-1 block text-xs font-semibold text-white/50">Grade level</label>
      <GradeBandPicker value={band} onChange={setBand} />

      <label className="mb-1 block text-xs font-semibold text-white/50">Avatar</label>
      <div className="mb-3 flex flex-wrap gap-2">
        {CHARACTERS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setAvatarId(c.id)}
            className={`rounded-xl border p-1 transition ${
              avatarId === c.id ? 'border-transparent' : 'border-white/10'
            }`}
            style={avatarId === c.id ? { background: `${ACCENT}22`, borderColor: `${ACCENT}aa` } : undefined}
          >
            <CharacterFace character={c} size={40} />
          </button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <NumberSetting
          label="Daily time"
          value={dailyLimitMinutes}
          min={5}
          max={240}
          suffix="min"
          onChange={setDailyLimitMinutes}
        />
        <NumberSetting
          label="Questions per block"
          value={questionBlockSize}
          min={5}
          max={20}
          onChange={setQuestionBlockSize}
        />
      </div>

      <label className="mb-1 block text-xs font-semibold text-white/50">
        Password (six or more letters or numbers)
      </label>
      <PasscodeInput value={code} onChange={setCode} placeholder="six or more characters" />

      <button
        type="button"
        disabled={busy || !name.trim() || !username.trim() || code.length < 6}
        onClick={submit}
        className="mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-bold text-[#101020] disabled:opacity-40"
        style={{ background: ACCENT }}
      >
        Create player
      </button>
      <BackRow label="Back" back={back} />
    </div>
  );
}

function ParentPanel({
  actions,
  profiles,
  masterExists,
  back,
}: {
  actions: Actions;
  profiles: Profile[];
  masterExists: boolean;
  back: () => void;
}) {
  const [authed, setAuthed] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const enterParent = () => {
    actions.setActive(null);
    setPlayerMode('parent');
  };

  // First run: no parent passcode set yet. Let the parent create one.
  if (!masterExists) {
    return (
      <div className="mx-auto max-w-xs text-center">
        <div className="mb-1 font-bold text-white">Set a parent password</div>
        <div className="mb-3 text-xs text-white/50">
          Used to open parent settings and reset a child&apos;s password.
        </div>
        <PasscodeInput value={code} onChange={setCode} placeholder="new code" />
        <button
          type="button"
          disabled={busy || code.length < 6}
          onClick={async () => {
            setBusy(true);
            await actions.setMaster(code);
            setBusy(false);
            setAuthed(true);
            setCode('');
          }}
          className="mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-bold text-[#101020] disabled:opacity-40"
          style={{ background: ACCENT }}
        >
          Save password
        </button>
        <BackRow label="Back" back={back} />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-xs text-center">
        <div className="mb-1 font-bold text-white">Parent settings</div>
        <div className="mb-3 text-xs text-white/50">Enter the parent password.</div>
        <PasscodeInput value={code} onChange={(v) => { setCode(v); setError(false); }} placeholder="••••" />
        {error && <div className="mt-2 text-xs font-semibold text-rose-400">Wrong password.</div>}
        <button
          type="button"
          disabled={busy || code.length === 0}
          onClick={async () => {
            setBusy(true);
            const ok = await actions.verifyMaster(code);
            setBusy(false);
            if (ok) setAuthed(true);
            else { setError(true); setCode(''); }
          }}
          className="mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-bold text-[#101020] disabled:opacity-40"
          style={{ background: ACCENT }}
        >
          Unlock
        </button>
        <BackRow label="Back" back={back} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">
        Parent settings
      </div>
      {note && <div className="mb-2 text-xs font-semibold text-emerald-400">{note}</div>}
      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <Link
          href="/parent"
          onClick={enterParent}
          className="flex min-h-12 items-center justify-center rounded-xl bg-amber-300 px-4 text-sm font-black text-[#211704]"
        >
          Open parent center
        </Link>
        <button
          type="button"
          onClick={() => {
            enterParent();
            back();
          }}
          className="min-h-12 rounded-xl border border-white/15 bg-white/[0.06] px-4 text-sm font-black text-white"
        >
          Play without limits
        </button>
      </div>
      <div className="grid gap-2">
        {profiles.length === 0 && <div className="text-sm text-white/50">No players yet.</div>}
        {profiles.map((profile) => (
          <ParentLearnerCard
            key={profile.id}
            profile={profile}
            actions={actions}
            onNote={setNote}
          />
        ))}
      </div>
      <BackRow label="Done" back={back} />
    </div>
  );
}

function GradeBandPicker({
  value,
  onChange,
}: {
  value: GradeBand;
  onChange: (band: GradeBand) => void;
}) {
  return (
    <div className="mb-3 rounded-2xl border border-white/12 bg-white/[0.035] p-3">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as GradeBand)}
        className="min-h-12 w-full rounded-xl border border-white/12 bg-[#181526] px-3 text-sm font-black text-white outline-none focus:border-violet-300"
      >
        <optgroup label="School grade">
          {GENERIC_GRADE_BANDS.map((band) => (
            <option key={band} value={band}>
              {GRADE_BAND_LABELS[band]}
            </option>
          ))}
        </optgroup>
        <optgroup label="ISEE preparation">
          {ISEE_GRADE_BANDS.map((band) => (
            <option key={band} value={band}>
              {GRADE_BAND_LABELS[band]}
            </option>
          ))}
        </optgroup>
      </select>
      <div className="mt-2 text-sm font-black leading-snug text-white">
        {GRADE_BAND_LABELS[value]}
      </div>
      <div className="mt-1 text-[11px] leading-relaxed text-white/50">
        {GRADE_BAND_BLURBS[value]}
      </div>
    </div>
  );
}

function NumberSetting({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="rounded-xl border border-white/10 bg-black/20 p-2.5">
      <span className="block text-[10px] font-black uppercase tracking-wider text-white/45">
        {label}
      </span>
      <span className="mt-1 flex items-center gap-1">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(event) =>
            onChange(Math.max(min, Math.min(max, Number(event.target.value) || min)))
          }
          className="min-w-0 flex-1 bg-transparent text-lg font-black text-white outline-none"
        />
        {suffix && <span className="text-xs font-bold text-white/40">{suffix}</span>}
      </span>
    </label>
  );
}

function ParentLearnerCard({
  profile,
  actions,
  onNote,
}: {
  profile: Profile;
  actions: Actions;
  onNote: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [band, setBand] = useState(profile.band);
  const [dailyLimitMinutes, setDailyLimitMinutes] = useState(profile.dailyLimitMinutes);
  const [questionBlockSize, setQuestionBlockSize] = useState(profile.questionBlockSize);
  const [smartPractice, setSmartPractice] = useState(profile.smartPractice);
  const [username, setUsername] = useState(profile.username);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-3">
        <CharacterFace character={getCharacter(profile.avatarId)} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-white">{profile.name}</div>
          <div className="truncate text-[11px] text-cyan-200/65">@{profile.username}</div>
          <div className="mt-0.5 text-[11px] leading-snug text-white/45">
            {GRADE_BAND_LABELS[profile.band]} · {profile.dailyLimitMinutes} min/day ·{' '}
            {profile.questionBlockSize} questions
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing((open) => !open)}
          className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-white/80"
        >
          {editing ? 'Close' : 'Edit'}
        </button>
      </div>

      {editing && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="mb-1 text-xs font-semibold text-white/50">Grade or test level</div>
          <GradeBandPicker value={band} onChange={setBand} />
          <div className="grid grid-cols-2 gap-3">
            <NumberSetting
              label="Daily time"
              value={dailyLimitMinutes}
              min={5}
              max={240}
              suffix="min"
              onChange={setDailyLimitMinutes}
            />
            <NumberSetting
              label="Questions"
              value={questionBlockSize}
              min={5}
              max={20}
              onChange={setQuestionBlockSize}
            />
          </div>
          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-cyan-200/15 bg-cyan-200/[0.055] p-3">
            <input
              type="checkbox"
              checked={smartPractice}
              onChange={(event) => setSmartPractice(event.target.checked)}
              className="mt-1 h-5 w-5 accent-cyan-300"
            />
            <span>
              <span className="block text-sm font-black text-white">Smart Practice</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-white/50">
                Gently adds a little more practice in proven weak areas while keeping the
                question mix varied and approachable.
              </span>
            </span>
          </label>
          <button
            type="button"
            onClick={() => {
              actions.update(profile.id, {
                band,
                dailyLimitMinutes,
                questionBlockSize,
                smartPractice,
              });
              onNote(`${profile.name}'s learning settings were saved.`);
            }}
            className="mt-3 w-full rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-black text-[#071821]"
          >
            Save learning settings
          </button>

          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
            <label className="mb-1 block text-xs font-semibold text-white/50">
              Child username
            </label>
            <input
              value={username}
              onChange={(event) =>
                setUsername(
                  event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24),
                )
              }
              autoCapitalize="none"
              autoComplete="username"
              className="mb-3 min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 font-bold text-white outline-none focus:border-cyan-200/60"
            />
            <label className="mb-1 block text-xs font-semibold text-white/50">
              New password <span className="font-normal text-white/30">(optional)</span>
            </label>
            <PasscodeInput
              value={newPassword}
              onChange={setNewPassword}
              placeholder="six or more characters"
            />
            <button
              type="button"
              disabled={busy || username.length < 1 || (newPassword.length > 0 && newPassword.length < 6)}
              onClick={async () => {
                setBusy(true);
                actions.update(profile.id, { username });
                if (newPassword) await actions.setPasscode(profile.id, newPassword);
                setNewPassword('');
                setBusy(false);
                onNote(
                  newPassword
                    ? `${profile.name}'s username and password were saved.`
                    : `${profile.name}'s username was saved.`,
                );
              }}
              className="mt-2 w-full rounded-xl border border-white/15 bg-white/[0.07] px-3 py-2 text-xs font-black text-white disabled:opacity-35"
            >
              Save child login
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  `Remove ${profile.name}? Their saved progress remains in the family cloud unless it is deleted there.`,
                )
              ) {
                actions.remove(profile.id);
              }
            }}
            className="mt-3 text-xs font-semibold text-rose-300/80 underline"
          >
            Remove learner
          </button>
        </div>
      )}
    </div>
  );
}

function BackRow({ label, back }: { label: string; back: () => void }) {
  return (
    <button
      type="button"
      onClick={back}
      className="mt-3 text-xs font-semibold text-white/40 underline hover:text-white/70"
    >
      {label}
    </button>
  );
}
