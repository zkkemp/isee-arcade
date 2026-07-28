'use client';

import { useCallback, useMemo, useState } from 'react';
import { normalizeAccountUsername } from '@/lib/accountUsername';

export type ParentAccount = {
  user_id: string;
  username: string;
  account_role: 'parent';
  status: 'active' | 'suspended' | 'removed';
  created_at: string;
  updated_at: string;
};

type Notice = {
  tone: 'success' | 'error';
  message: string;
};

async function requestJson<T extends { error?: string }>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ ok: boolean; payload: T }> {
  try {
    const response = await fetch(input, init);
    try {
      return { ok: response.ok, payload: (await response.json()) as T };
    } catch {
      return {
        ok: false,
        payload: { error: 'The server returned an unreadable response. Please try again.' } as T,
      };
    }
  } catch {
    return {
      ok: false,
      payload: { error: 'ISEE Arcade could not reach the server. Check the connection and retry.' } as T,
    };
  }
}

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function makePassword(length = 8): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => PASSWORD_CHARS[value % PASSWORD_CHARS.length]).join('');
}

function statusLabel(status: ParentAccount['status']) {
  if (status === 'active') return 'Active';
  if (status === 'suspended') return 'Suspended';
  return 'Removed';
}

function statusClass(status: ParentAccount['status']) {
  if (status === 'active') return 'bg-emerald-300/12 text-emerald-100 ring-emerald-200/15';
  if (status === 'suspended') return 'bg-amber-300/12 text-amber-100 ring-amber-200/15';
  return 'bg-white/[0.06] text-white/45 ring-white/10';
}

export default function OwnerAccountManager({
  adminConfigured,
  initialParents,
}: {
  adminConfigured: boolean;
  initialParents: ParentAccount[];
}) {
  const [parents, setParents] = useState<ParentAccount[]>(initialParents);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const activeCount = useMemo(
    () => parents.filter((parent) => parent.status === 'active').length,
    [parents],
  );

  const loadParents = useCallback(async () => {
    if (!adminConfigured) return;
    setBusy('load');
    const { ok, payload } = await requestJson<{
      parents?: ParentAccount[];
      error?: string;
    }>('/api/owner/parents', { cache: 'no-store' });
    if (ok) {
      setParents(payload.parents ?? []);
    } else {
      setNotice({ tone: 'error', message: payload.error ?? 'Parent accounts could not be loaded.' });
    }
    setBusy(null);
  }, [adminConfigured]);

  async function createParent() {
    const cleanUsername = normalizeAccountUsername(username);
    if (cleanUsername.length < 3 || !/^[A-Za-z0-9]{6,64}$/.test(password)) {
      setNotice({
        tone: 'error',
        message: 'Use a 3-character username and a 6-character-or-longer password with letters or numbers.',
      });
      return;
    }

    setBusy('create');
    setNotice(null);
    const { ok, payload } = await requestJson<{
      parent?: ParentAccount;
      error?: string;
    }>('/api/owner/parents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: cleanUsername, password }),
    });
    if (ok && payload.parent) {
      setParents((current) => [payload.parent!, ...current]);
      setCredentials({ username: cleanUsername, password });
      setUsername('');
      setPassword('');
      setNotice({ tone: 'success', message: `Parent @${cleanUsername} is ready to sign in.` });
    } else {
      setNotice({ tone: 'error', message: payload.error ?? 'The parent account could not be created.' });
    }
    setBusy(null);
  }

  async function runAction(
    parent: ParentAccount,
    action: 'suspend' | 'activate' | 'reset_password',
    nextPassword?: string,
  ) {
    setBusy(`${action}:${parent.user_id}`);
    setNotice(null);
    const { ok, payload } = await requestJson<{
      parent?: ParentAccount;
      error?: string;
      message?: string;
    }>(`/api/owner/parents/${parent.user_id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, password: nextPassword }),
    });
    if (payload.parent) {
      setParents((current) =>
        current.map((item) => (item.user_id === payload.parent!.user_id ? payload.parent! : item)),
      );
    }
    if (ok && payload.parent) {
      if (action === 'reset_password' && nextPassword) {
        setCredentials({ username: parent.username, password: nextPassword });
        setResetting(null);
        setResetPassword('');
      }
      setNotice({ tone: 'success', message: payload.message ?? 'Parent access updated.' });
    } else {
      setNotice({ tone: 'error', message: payload.error ?? 'The account could not be updated.' });
    }
    setBusy(null);
  }

  async function removeAccess(parent: ParentAccount) {
    setBusy(`remove:${parent.user_id}`);
    setNotice(null);
    const { ok, payload } = await requestJson<{
      parent?: ParentAccount;
      error?: string;
      message?: string;
    }>(`/api/owner/parents/${parent.user_id}`, { method: 'DELETE' });
    if (payload.parent) {
      setParents((current) =>
        current.map((item) => (item.user_id === payload.parent!.user_id ? payload.parent! : item)),
      );
    }
    if (ok && payload.parent) {
      setConfirmRemove(null);
      setNotice({ tone: 'success', message: payload.message ?? 'Parent access removed.' });
    } else {
      setNotice({ tone: 'error', message: payload.error ?? 'Parent access could not be removed.' });
    }
    setBusy(null);
  }

  async function copyCredentials() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(
        `ISEE Arcade\nUsername: ${credentials.username}\nPassword: ${credentials.password}`,
      );
      setNotice({ tone: 'success', message: 'Sign-in details copied.' });
    } catch {
      setNotice({
        tone: 'error',
        message: 'Copy is unavailable here. Press and hold the visible sign-in details to copy them.',
      });
    }
  }

  if (!adminConfigured) {
    return (
      <section className="rounded-3xl border border-amber-200/20 bg-amber-200/[0.07] p-6 sm:p-8">
        <p className="text-xs font-black uppercase tracking-[.18em] text-amber-200">One setup item</p>
        <h2 className="mt-2 text-2xl font-black text-white">Secure admin key needed</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/60">
          Add this ISEE Arcade project’s service-role key to Vercel as
          <code className="mx-1 rounded bg-black/25 px-1.5 py-0.5 text-amber-100">
            SUPABASE_SERVICE_ROLE_KEY
          </code>
          . It stays on the server and lets this private screen create, reset, suspend, and remove
          parent access.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-[linear-gradient(135deg,rgba(34,211,238,.13),rgba(167,139,250,.09)_58%,rgba(244,114,182,.1))] p-[1px] shadow-[0_28px_80px_rgba(0,0,0,.25)]">
        <div className="rounded-[calc(1.5rem-1px)] bg-[#121222]/92 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-cyan-200">
                Issue private access
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-[-.025em] text-white">
                Create a parent sign-in
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/52">
                Parents can add and manage only their own children. No email address is needed.
              </p>
            </div>
            <div className="rounded-2xl bg-black/20 px-4 py-3 text-right">
              <p className="text-2xl font-black text-white">{activeCount}</p>
              <p className="text-[10px] font-black uppercase tracking-[.14em] text-white/38">
                active parents
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-[.12em] text-white/52">
                Username
              </span>
              <input
                value={username}
                onChange={(event) => setUsername(normalizeAccountUsername(event.target.value))}
                autoCapitalize="none"
                autoComplete="off"
                placeholder="smithfamily"
                className="min-h-12 w-full rounded-xl bg-white/[0.07] px-4 text-base text-white outline-none ring-1 ring-white/10 transition placeholder:text-white/25 focus:ring-2 focus:ring-cyan-300"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[.12em] text-white/52">
                Temporary password
                <button
                  type="button"
                  onClick={() => setPassword(makePassword())}
                  className="normal-case tracking-normal text-cyan-200 hover:text-cyan-100"
                >
                  Make one
                </button>
              </span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 64))}
                autoComplete="new-password"
                placeholder="6+ letters or numbers"
                className="min-h-12 w-full rounded-xl bg-white/[0.07] px-4 text-base text-white outline-none ring-1 ring-white/10 transition placeholder:text-white/25 focus:ring-2 focus:ring-cyan-300"
              />
            </label>
            <button
              type="button"
              onClick={() => void createParent()}
              disabled={busy !== null}
              className="min-h-12 rounded-xl bg-cyan-300 px-6 text-sm font-black text-[#0e1722] shadow-[0_12px_28px_rgba(34,211,238,.18)] transition hover:bg-cyan-200 active:scale-[.98] disabled:opacity-45"
            >
              {busy === 'create' ? 'Creating…' : 'Create parent'}
            </button>
          </div>
        </div>
      </section>

      {credentials && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200/15 bg-emerald-200/[0.07] px-5 py-4">
          <div>
            <p className="text-sm font-black text-emerald-100">Ready to share with the parent</p>
            <p className="mt-1 font-mono text-sm text-white/70">
              @{credentials.username} · {credentials.password}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyCredentials()}
            className="min-h-11 rounded-xl bg-emerald-200 px-4 text-sm font-black text-[#102019]"
          >
            Copy sign-in
          </button>
        </section>
      )}

      {notice && (
        <p
          role="status"
          className={`rounded-2xl px-5 py-4 text-sm font-bold ${
            notice.tone === 'success'
              ? 'bg-emerald-300/10 text-emerald-100'
              : 'bg-rose-300/10 text-rose-100'
          }`}
        >
          {notice.message}
        </p>
      )}

      <section className="rounded-3xl bg-[#151527] p-5 shadow-[0_22px_70px_rgba(0,0,0,.25)] sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[.18em] text-violet-200">
              Family access
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">Parent accounts</h2>
          </div>
          <button
            type="button"
            onClick={() => void loadParents()}
            disabled={busy !== null}
            className="min-h-11 rounded-xl bg-white/[0.06] px-4 text-sm font-black text-white/65 hover:bg-white/10"
          >
            Refresh
          </button>
        </div>

        {busy === 'load' && parents.length === 0 ? (
          <p className="mt-6 rounded-2xl bg-white/[0.04] px-5 py-8 text-center text-sm text-white/45">
            Loading parent accounts…
          </p>
        ) : parents.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center">
            <div className="text-3xl" aria-hidden="true">⌁</div>
            <p className="mt-3 text-sm font-black text-white">No parent accounts yet</p>
            <p className="mt-1 text-xs text-white/42">Create the first private sign-in above.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {parents.map((parent) => {
              const rowBusy = busy !== null;
              const resettingThis = resetting === parent.user_id;
              const removingThis = confirmRemove === parent.user_id;
              return (
                <article
                  key={parent.user_id}
                  className={`rounded-2xl border p-4 transition sm:p-5 ${
                    parent.status === 'removed'
                      ? 'border-white/[0.06] bg-black/10 opacity-65'
                      : 'border-white/[0.08] bg-white/[0.035]'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-black text-white">@{parent.username}</h3>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[.12em] ring-1 ${statusClass(parent.status)}`}
                        >
                          {statusLabel(parent.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-white/38">
                        Created {new Date(parent.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    {parent.status !== 'removed' && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setResetting(resettingThis ? null : parent.user_id);
                            setResetPassword('');
                            setConfirmRemove(null);
                          }}
                          disabled={rowBusy}
                          className="min-h-10 rounded-xl bg-white/[0.07] px-3 text-xs font-black text-white/70 hover:bg-white/10"
                        >
                          Reset password
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void runAction(
                              parent,
                              parent.status === 'active' ? 'suspend' : 'activate',
                            )
                          }
                          disabled={rowBusy}
                          className="min-h-10 rounded-xl bg-amber-200/10 px-3 text-xs font-black text-amber-100 hover:bg-amber-200/15"
                        >
                          {parent.status === 'active' ? 'Suspend' : 'Restore'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmRemove(removingThis ? null : parent.user_id);
                            setResetting(null);
                          }}
                          disabled={rowBusy}
                          className="min-h-10 rounded-xl bg-rose-300/10 px-3 text-xs font-black text-rose-100 hover:bg-rose-300/15"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>

                  {resettingThis && (
                    <div className="mt-4 flex flex-wrap gap-2 rounded-xl bg-black/18 p-3">
                      <input
                        value={resetPassword}
                        onChange={(event) =>
                          setResetPassword(
                            event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 64),
                          )
                        }
                        autoComplete="new-password"
                        placeholder="New temporary password"
                        className="min-h-11 min-w-56 flex-1 rounded-lg bg-white/[0.07] px-3 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-300"
                      />
                      <button
                        type="button"
                        onClick={() => setResetPassword(makePassword())}
                        className="min-h-11 rounded-lg bg-white/[0.07] px-3 text-xs font-black text-cyan-100"
                      >
                        Make one
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void runAction(parent, 'reset_password', resetPassword)
                        }
                        disabled={rowBusy || !/^[A-Za-z0-9]{6,64}$/.test(resetPassword)}
                        className="min-h-11 rounded-lg bg-cyan-300 px-4 text-xs font-black text-[#0e1722] disabled:opacity-40"
                      >
                        Save reset
                      </button>
                    </div>
                  )}

                  {removingThis && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-rose-300/[0.07] p-3">
                      <p className="max-w-xl text-xs font-semibold leading-relaxed text-rose-100/80">
                        Remove @{parent.username}’s sign-in? Their children and learning records
                        will be preserved, but this username cannot be restored.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmRemove(null)}
                          className="min-h-10 rounded-lg px-3 text-xs font-black text-white/60"
                        >
                          Keep account
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeAccess(parent)}
                          disabled={rowBusy}
                          className="min-h-10 rounded-lg bg-rose-300 px-3 text-xs font-black text-[#2a1018]"
                        >
                          Remove access
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
