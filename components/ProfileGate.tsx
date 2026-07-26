'use client';

import { useState } from 'react';
import CharacterFace from './CharacterFace';
import { CHARACTERS, getCharacter, type CharacterId } from '@/lib/characters';
import {
  GRADE_BANDS,
  GRADE_BAND_BLURBS,
  GRADE_BAND_LABELS,
  type GradeBand,
} from '@/lib/questions';
import {
  useActiveProfile,
  useMasterExists,
  useProfileActions,
  useProfiles,
  type Profile,
} from '@/lib/profiles';

/**
 * Who is playing.
 *
 * Each kid is a local profile with a grade band (which question bank they get),
 * an avatar, and an optional passcode. A master account ("Zach") can reset a
 * forgotten passcode. Everything is on-device - this is a private family app, so
 * the passcode is a speed bump between siblings, not real auth (see lib/profiles).
 */

type View = 'closed' | 'choose' | 'login' | 'create' | 'parent' | 'parentUnlock';

const ACCENT = '#a78bfa';

export default function ProfileGate() {
  const profiles = useProfiles();
  const active = useActiveProfile();
  const masterExists = useMasterExists();
  const actions = useProfileActions();

  // Open straight to the chooser when nobody is signed in yet.
  const [view, setView] = useState<View>('closed');
  // True once the parent has unlocked a switch this session, so the chooser can
  // activate a player directly instead of re-asking for that kid's own passcode.
  const [unlocked, setUnlocked] = useState(false);
  const open = view !== 'closed';
  const showChooser = open || !active;

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
        {active ? (
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
          {active ? (open ? 'Close' : 'Switch player') : 'Choose player'}
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
      <div className="mt-1 font-bold text-white">Parent passcode to switch</div>
      <div className="mb-3 text-xs text-white/50">
        Only a parent can change who is playing, so kids can&apos;t switch to easier questions.
      </div>
      <PasscodeInput value={code} onChange={(v) => { setCode(v); setError(false); }} placeholder="••••" />
      {error && <div className="mt-2 text-xs font-semibold text-rose-400">Wrong passcode.</div>}
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
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-center text-lg font-bold tracking-[0.3em] text-white outline-none focus:border-white/40"
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
      <div className="mb-3 text-xs text-white/50">Enter passcode to play</div>
      <PasscodeInput value={code} onChange={(v) => { setCode(v); setError(false); }} placeholder="••••" />
      {error && <div className="mt-2 text-xs font-semibold text-rose-400">Wrong passcode. Try again.</div>}
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
  const [band, setBand] = useState<GradeBand>('grade3');
  const [avatarId, setAvatarId] = useState<CharacterId>('dakota');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const profile = actions.add({ name, band, avatarId });
    if (code) await actions.setPasscode(profile.id, code);
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
        placeholder="Name"
        className="mb-3 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 font-bold text-white outline-none focus:border-white/40"
      />

      <label className="mb-1 block text-xs font-semibold text-white/50">Grade level</label>
      <div className="mb-3 grid gap-2">
        {GRADE_BANDS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setBand(g)}
            className={`rounded-xl border p-2.5 text-left transition ${
              band === g ? 'border-transparent' : 'border-white/12 bg-white/[0.03]'
            }`}
            style={band === g ? { background: `${ACCENT}22`, borderColor: `${ACCENT}aa` } : undefined}
          >
            <div className="text-sm font-bold text-white">{GRADE_BAND_LABELS[g]}</div>
            <div className="text-[11px] text-white/50">{GRADE_BAND_BLURBS[g]}</div>
          </button>
        ))}
      </div>

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

      <label className="mb-1 block text-xs font-semibold text-white/50">
        Passcode (optional - leave blank for no lock)
      </label>
      <PasscodeInput value={code} onChange={setCode} placeholder="optional" />

      <button
        type="button"
        disabled={busy || !name.trim()}
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

  // First run: no parent passcode set yet. Let the parent create one.
  if (!masterExists) {
    return (
      <div className="mx-auto max-w-xs text-center">
        <div className="mb-1 font-bold text-white">Set a parent passcode</div>
        <div className="mb-3 text-xs text-white/50">
          Used to reset a kid&apos;s forgotten passcode. Username: <strong>Zach</strong>.
        </div>
        <PasscodeInput value={code} onChange={setCode} placeholder="new code" />
        <button
          type="button"
          disabled={busy || code.length < 4}
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
          Save (4+ digits)
        </button>
        <BackRow label="Back" back={back} />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-xs text-center">
        <div className="mb-1 font-bold text-white">Parent settings</div>
        <div className="mb-3 text-xs text-white/50">Enter the parent passcode (Zach).</div>
        <PasscodeInput value={code} onChange={(v) => { setCode(v); setError(false); }} placeholder="••••" />
        {error && <div className="mt-2 text-xs font-semibold text-rose-400">Wrong passcode.</div>}
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
      <div className="grid gap-2">
        {profiles.length === 0 && <div className="text-sm text-white/50">No players yet.</div>}
        {profiles.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
          >
            <CharacterFace character={getCharacter(p.avatarId)} size={36} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-white">{p.name}</div>
              <div className="text-[11px] text-white/45">
                {GRADE_BAND_LABELS[p.band]} · {p.passcodeHash ? 'passcode set' : 'no passcode'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                actions.resetPasscode(p.id);
                setNote(`${p.name}'s passcode cleared - they can set a new one.`);
              }}
              className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/80 active:scale-95"
            >
              Reset code
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm(`Remove ${p.name}? Their progress stays on the device but the player is hidden.`)) {
                  actions.remove(p.id);
                }
              }}
              className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-2.5 py-1.5 text-xs font-semibold text-rose-300 active:scale-95"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <BackRow label="Done" back={back} />
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
