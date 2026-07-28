'use client';

import { useMemo, useState, type ReactNode } from 'react';
import AvatarPicker from '@/components/AvatarPicker';
import CharacterFace from '@/components/CharacterFace';
import { getCharacter, type CharacterId } from '@/lib/characters';
import {
  GRADE_BAND_BLURBS,
  GRADE_BAND_LABELS,
  GENERIC_GRADE_BANDS,
  ISEE_GRADE_BANDS,
  type GradeBand,
} from '@/lib/questions';
import {
  cleanUsername,
  useProfileActions,
  useProfiles,
  type Profile,
} from '@/lib/profiles';
import { uploadDeviceState } from '@/lib/cloudSync';

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function makePassword(length = 8): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => PASSWORD_CHARS[value % PASSWORD_CHARS.length]).join('');
}

type EditorState = {
  id: string | null;
  name: string;
  username: string;
  password: string;
  band: GradeBand;
  avatarId: CharacterId;
  dailyLimitMinutes: number;
  questionBlockSize: number;
  smartPractice: boolean;
};

function editorFrom(profile?: Profile): EditorState {
  return {
    id: profile?.id ?? null,
    name: profile?.name ?? '',
    username: profile?.username ?? '',
    password: '',
    band: profile?.band ?? 'grade3',
    avatarId: profile?.avatarId ?? 'marty',
    dailyLimitMinutes: profile?.dailyLimitMinutes ?? 30,
    questionBlockSize: profile?.questionBlockSize ?? 8,
    smartPractice: profile?.smartPractice ?? true,
  };
}

export default function ParentChildren() {
  const profiles = useProfiles();
  const actions = useProfileActions();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [credentials, setCredentials] = useState<{ name: string; username: string; password: string } | null>(null);

  const activeEditorProfile = useMemo(
    () => profiles.find((profile) => profile.id === editor?.id),
    [editor?.id, profiles],
  );

  function openEditor(profile?: Profile) {
    setEditor(editorFrom(profile));
    setShowPassword(false);
    setRemoveId(null);
    setNotice(null);
    window.requestAnimationFrame(() => {
      document.getElementById('child-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function saveChild() {
    if (!editor || busy) return;
    const name = editor.name.trim().slice(0, 16);
    const username = cleanUsername(editor.username);
    const duplicate = profiles.some(
      (profile) => profile.id !== editor.id && profile.username === username,
    );

    if (!name || username.length < 2) {
      setNotice({
        tone: 'error',
        message: 'Add a display name and a username with at least two letters or numbers.',
      });
      return;
    }
    if (duplicate) {
      setNotice({
        tone: 'error',
        message: `@${username} is already used by another child. Choose a different username.`,
      });
      return;
    }
    if ((!editor.id && editor.password.length < 6) || (editor.password && editor.password.length < 6)) {
      setNotice({
        tone: 'error',
        message: 'Child passwords need at least six letters or numbers.',
      });
      return;
    }

    setBusy(true);
    setNotice(null);
    const usernameCheck = await fetch(
      `/api/parent/username?username=${encodeURIComponent(username)}${
        editor.id ? `&exclude=${encodeURIComponent(editor.id)}` : ''
      }`,
    );
    const usernameResult = (await usernameCheck.json()) as {
      available?: boolean;
      error?: string;
    };
    if (!usernameCheck.ok || !usernameResult.available) {
      setBusy(false);
      setNotice({
        tone: 'error',
        message:
          usernameResult.error ??
          `@${username} is already used by another account. Choose a different username.`,
      });
      return;
    }
    if (editor.id) {
      actions.update(editor.id, {
        name,
        username,
        band: editor.band,
        avatarId: editor.avatarId,
        dailyLimitMinutes: editor.dailyLimitMinutes,
        questionBlockSize: editor.questionBlockSize,
        smartPractice: editor.smartPractice,
      });
      if (editor.password) {
        await actions.setPasscode(editor.id, editor.password);
        setCredentials({ name, username, password: editor.password });
      }
      setNotice({
        tone: 'success',
        message: editor.password
          ? `${name}'s profile and new password are saved.`
          : `${name}'s profile is saved. Their password stayed the same.`,
      });
    } else {
      const profile = actions.add({
        name,
        username,
        band: editor.band,
        avatarId: editor.avatarId,
        dailyLimitMinutes: editor.dailyLimitMinutes,
        questionBlockSize: editor.questionBlockSize,
        smartPractice: editor.smartPractice,
      });
      await actions.setPasscode(profile.id, editor.password);
      setCredentials({ name, username: profile.username, password: editor.password });
      setNotice({
        tone: 'success',
        message: `${name} is ready. Share the username and password with them.`,
      });
    }
    const synced = await uploadDeviceState();
    if (!synced.ok) {
      setBusy(false);
      setNotice({
        tone: 'error',
        message: `The profile is saved on this device, but cloud saving failed: ${synced.message}`,
      });
      return;
    }
    setBusy(false);
    setEditor(null);
  }

  async function copyCredentials() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(
        `ISEE Arcade\n${credentials.name}\nUsername: ${credentials.username}\nPassword: ${credentials.password}`,
      );
      setNotice({ tone: 'success', message: `${credentials.name}'s sign-in was copied.` });
    } catch {
      setNotice({
        tone: 'error',
        message: 'Copy is unavailable here. Press and hold the username and password instead.',
      });
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-[#151527] shadow-[0_24px_70px_rgba(0,0,0,.28)]">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-7">
          <div>
            <p className="text-xs font-black text-cyan-200">Family sign-ins</p>
            <h2 className="mt-1 text-2xl font-black tracking-[-.025em] text-white">
              Manage every child in one place
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/52">
              Create usernames, replace forgotten passwords, change levels, and choose from
              88 avatars across realistic kids and fantastic non-human friends. Each child keeps
              separate progress and play time.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openEditor()}
            className="min-h-12 rounded-xl bg-cyan-200 px-5 text-sm font-black text-[#09202a] shadow-[0_12px_28px_rgba(103,232,249,.16)] transition hover:bg-cyan-100 active:scale-[.98]"
          >
            + Add a child
          </button>
        </div>

        {profiles.length === 0 ? (
          <div className="border-t border-white/[0.07] px-5 py-12 text-center">
            <div className="text-4xl" aria-hidden="true">🛸</div>
            <h3 className="mt-3 text-lg font-black text-white">Your crew is ready to grow</h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-white/45">
              Add the first child, choose their level, and give them an easy username and password.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.07] border-t border-white/[0.07]">
            {profiles.map((profile) => (
              <article key={profile.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-4">
                  <div
                    className="flex h-16 w-16 items-center justify-center rounded-2xl"
                    style={{ background: `${getCharacter(profile.avatarId).accent}18` }}
                  >
                    <CharacterFace character={getCharacter(profile.avatarId)} size={54} />
                  </div>
                  <div className="min-w-40 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h3 className="text-lg font-black text-white">{profile.name}</h3>
                      <span className="rounded-full bg-cyan-200/[0.09] px-2.5 py-1 text-[11px] font-black text-cyan-100">
                        @{profile.username}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-white/45">
                      {GRADE_BAND_LABELS[profile.band]} · {profile.dailyLimitMinutes} min/day ·{' '}
                      {profile.questionBlockSize} questions
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openEditor(profile)}
                      className="min-h-11 rounded-xl bg-violet-300/14 px-4 text-xs font-black text-violet-100 transition hover:bg-violet-300/20"
                    >
                      Edit profile & sign-in
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoveId(removeId === profile.id ? null : profile.id)}
                      className="min-h-11 rounded-xl bg-white/[0.055] px-4 text-xs font-black text-white/52 transition hover:bg-rose-300/10 hover:text-rose-100"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {removeId === profile.id && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-rose-300/[0.07] p-4">
                    <p className="max-w-xl text-xs font-semibold leading-relaxed text-rose-100/82">
                      Remove {profile.name} from this device? Their cloud record is preserved until
                      the next family sync.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setRemoveId(null)}
                        className="min-h-10 rounded-lg bg-white/[0.07] px-3 text-xs font-black text-white/65"
                      >
                        Keep child
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setBusy(true);
                          const response = await fetch(
                            `/api/parent/children/${encodeURIComponent(profile.id)}`,
                            { method: 'DELETE' },
                          );
                          if (!response.ok) {
                            const result = (await response.json()) as { error?: string };
                            setBusy(false);
                            setNotice({
                              tone: 'error',
                              message: result.error ?? 'The child account could not be removed.',
                            });
                            return;
                          }
                          actions.remove(profile.id);
                          setBusy(false);
                          setRemoveId(null);
                          setNotice({ tone: 'success', message: `${profile.name}’s account was removed.` });
                        }}
                        className="min-h-10 rounded-lg bg-rose-200 px-3 text-xs font-black text-[#2a0b12]"
                      >
                        Yes, remove
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {credentials && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-emerald-300/[0.08] px-5 py-4 ring-1 ring-emerald-200/15">
          <div>
            <p className="text-sm font-black text-emerald-100">{credentials.name}&apos;s sign-in</p>
            <p className="mt-1 text-sm text-white/72">
              <span className="font-black">@{credentials.username}</span>
              <span className="mx-2 text-white/25">•</span>
              <span className="font-mono">{credentials.password}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyCredentials()}
            className="min-h-11 rounded-xl bg-emerald-200 px-4 text-xs font-black text-[#102019]"
          >
            Copy sign-in
          </button>
        </section>
      )}

      {notice && (
        <p
          role="status"
          className={`rounded-xl px-5 py-4 text-sm font-bold ${
            notice.tone === 'success'
              ? 'bg-emerald-300/10 text-emerald-100'
              : 'bg-rose-300/10 text-rose-100'
          }`}
        >
          {notice.message}
        </p>
      )}

      {editor && (
        <section
          id="child-editor"
          className="scroll-mt-5 overflow-hidden rounded-2xl bg-[#151527] shadow-[0_24px_70px_rgba(0,0,0,.28)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.07] p-5 sm:p-7">
            <div>
              <p className="text-xs font-black text-violet-200">
                {editor.id ? 'Edit child' : 'New child'}
              </p>
              <h2 className="mt-1 text-2xl font-black text-white">
                {editor.id ? activeEditorProfile?.name ?? 'Child profile' : 'Build their player card'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setEditor(null)}
              className="min-h-11 rounded-xl bg-white/[0.06] px-4 text-xs font-black text-white/58"
            >
              Cancel
            </button>
          </div>

          <div className="grid gap-7 p-5 sm:p-7 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <Field label="Display name">
                  <input
                    value={editor.name}
                    onChange={(event) =>
                      setEditor({ ...editor, name: event.target.value.replace(/[^a-zA-Z '-]/g, '').slice(0, 16) })
                    }
                    autoComplete="off"
                    placeholder="What everyone sees"
                    className={inputClass}
                  />
                </Field>
                <Field label="Username">
                  <input
                    value={editor.username}
                    onChange={(event) =>
                      setEditor({ ...editor, username: cleanUsername(event.target.value) })
                    }
                    autoCapitalize="none"
                    autoComplete="username"
                    placeholder="Easy to remember"
                    className={inputClass}
                  />
                </Field>
              </div>

              <Field label={editor.id ? 'New password (leave blank to keep it)' : 'Password'}>
                <div className="flex gap-2">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={editor.password}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        password: event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 64),
                      })
                    }
                    autoComplete="new-password"
                    placeholder={editor.id ? 'Six or more letters or numbers' : 'Required · six or more'}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((shown) => !shown)}
                    className="min-h-12 rounded-xl bg-white/[0.06] px-3 text-xs font-black text-white/58"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditor({ ...editor, password: makePassword() });
                      setShowPassword(true);
                    }}
                    className="min-h-12 rounded-xl bg-cyan-200/10 px-3 text-xs font-black text-cyan-100"
                  >
                    Make one
                  </button>
                </div>
              </Field>

              <Field label="Grade or test level">
                <select
                  value={editor.band}
                  onChange={(event) => setEditor({ ...editor, band: event.target.value as GradeBand })}
                  className={inputClass}
                >
                  <optgroup label="School grade">
                    {GENERIC_GRADE_BANDS.map((band) => (
                      <option key={band} value={band}>{GRADE_BAND_LABELS[band]}</option>
                    ))}
                  </optgroup>
                  <optgroup label="ISEE preparation">
                    {ISEE_GRADE_BANDS.map((band) => (
                      <option key={band} value={band}>{GRADE_BAND_LABELS[band]}</option>
                    ))}
                  </optgroup>
                </select>
                <p className="mt-2 text-xs leading-relaxed text-white/42">
                  {GRADE_BAND_BLURBS[editor.band]}
                </p>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="Daily play"
                  value={editor.dailyLimitMinutes}
                  min={5}
                  max={240}
                  suffix="minutes"
                  onChange={(value) => setEditor({ ...editor, dailyLimitMinutes: value })}
                />
                <NumberField
                  label="Study block"
                  value={editor.questionBlockSize}
                  min={5}
                  max={20}
                  suffix="questions"
                  onChange={(value) => setEditor({ ...editor, questionBlockSize: value })}
                />
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-cyan-200/[0.055] p-4 ring-1 ring-cyan-200/15">
                <input
                  type="checkbox"
                  checked={editor.smartPractice}
                  onChange={(event) => setEditor({ ...editor, smartPractice: event.target.checked })}
                  className="mt-0.5 h-5 w-5 accent-cyan-200"
                />
                <span>
                  <span className="block text-sm font-black text-white">Smart Practice</span>
                  <span className="mt-1 block text-xs leading-relaxed text-white/48">
                    Gently revisits weak skills without making every session feel hard.
                  </span>
                </span>
              </label>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-white">Choose an avatar</h3>
                  <p className="mt-1 text-xs text-white/55">48 expressive people plus 40 aliens, robots, creatures, and magical friends.</p>
                </div>
                <CharacterFace character={getCharacter(editor.avatarId)} size={64} />
              </div>
              <AvatarPicker
                value={editor.avatarId}
                onChange={(avatarId) => setEditor({ ...editor, avatarId })}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] bg-black/10 px-5 py-4 sm:px-7">
            <p className="text-xs leading-relaxed text-white/42">
              {editor.id
                ? 'Leaving the password blank keeps the current password.'
                : 'The child uses these details on the main sign-in screen.'}
            </p>
            <button
              type="button"
              onClick={() => void saveChild()}
              disabled={busy}
              className="min-h-12 rounded-xl bg-violet-200 px-6 text-sm font-black text-[#171126] shadow-[0_12px_28px_rgba(196,181,253,.15)] disabled:opacity-45"
            >
              {busy ? 'Saving…' : editor.id ? 'Save child' : 'Create child'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

const inputClass =
  'min-h-12 w-full rounded-xl bg-white/[0.065] px-4 text-sm font-bold text-white outline-none ring-1 ring-white/10 transition placeholder:text-white/25 focus:ring-2 focus:ring-cyan-200';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black text-white/58">{label}</span>
      {children}
    </label>
  );
}

function NumberField({
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
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="rounded-xl bg-white/[0.045] p-3 ring-1 ring-white/10">
      <span className="block text-[11px] font-black text-white/48">{label}</span>
      <span className="mt-1 flex items-baseline gap-1">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          min={min}
          max={max}
          onChange={(event) =>
            onChange(Math.max(min, Math.min(max, Number(event.target.value) || min)))
          }
          className="min-w-0 flex-1 bg-transparent text-xl font-black text-white outline-none"
        />
        <span className="text-[10px] font-bold text-white/35">{suffix}</span>
      </span>
    </label>
  );
}
