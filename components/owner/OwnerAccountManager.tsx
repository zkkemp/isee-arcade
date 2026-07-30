'use client';

import { useCallback, useMemo, useState } from 'react';
import CharacterFace from '@/components/CharacterFace';
import { normalizeAccountUsername } from '@/lib/accountUsername';
import { getCharacter } from '@/lib/characters';
import type { OwnerParentAccount } from '@/lib/ownerParentTypes';
import { GRADE_BAND_LABELS } from '@/lib/questions';

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
const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function makePassword(length = 8): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => PASSWORD_CHARS[value % PASSWORD_CHARS.length]).join('');
}

function statusLabel(status: OwnerParentAccount['status']) {
  if (status === 'active') return 'Active';
  if (status === 'suspended') return 'Suspended';
  return 'Removed';
}

function statusClass(status: OwnerParentAccount['status']) {
  if (status === 'active') return 'bg-emerald-300/12 text-emerald-100 ring-emerald-200/15';
  if (status === 'suspended') return 'bg-amber-300/12 text-amber-100 ring-amber-200/15';
  return 'bg-white/[0.06] text-white/45 ring-white/10';
}

function formatDate(value: string): string {
  return DATE_FORMATTER.format(new Date(value));
}

function formatActivityDate(value: string | null): string {
  return value ? formatDate(value) : 'Never used';
}

export default function OwnerAccountManager({
  adminConfigured,
  initialParents,
  initialLoadError = '',
}: {
  adminConfigured: boolean;
  initialParents: OwnerParentAccount[];
  initialLoadError?: string;
}) {
  const [parents, setParents] = useState<OwnerParentAccount[]>(initialParents);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [parentSearch, setParentSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OwnerParentAccount['status']>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'least' | 'newest'>('recent');
  const [expandedParent, setExpandedParent] = useState<string | null>(null);
  const [directoryError, setDirectoryError] = useState(initialLoadError);

  const activeCount = useMemo(
    () => parents.filter((parent) => parent.status === 'active').length,
    [parents],
  );
  const neverUsedCount = useMemo(
    () => parents.filter((parent) => !parent.last_used_at).length,
    [parents],
  );
  const visibleParents = useMemo(() => {
    const query = normalizeAccountUsername(parentSearch);
    const filtered = parents.filter(
      (parent) =>
        (statusFilter === 'all' || parent.status === statusFilter) &&
        (!query ||
          parent.username.includes(query) ||
          parent.children.some(
            (child) =>
              normalizeAccountUsername(child.display_name).includes(query) ||
              child.username.includes(query),
          )),
    );
    return [...filtered].sort((a, b) => {
      if (sortBy === 'newest') return Date.parse(b.created_at) - Date.parse(a.created_at);
      const aActivity = a.last_used_at ? Date.parse(a.last_used_at) : 0;
      const bActivity = b.last_used_at ? Date.parse(b.last_used_at) : 0;
      return sortBy === 'recent' ? bActivity - aActivity : aActivity - bActivity;
    });
  }, [parentSearch, parents, sortBy, statusFilter]);

  const loadParents = useCallback(async () => {
    if (!adminConfigured) return;
    setBusy('load');
    const { ok, payload } = await requestJson<{
      parents?: OwnerParentAccount[];
      error?: string;
    }>('/api/owner/parents', { cache: 'no-store' });
    if (ok) {
      setParents(payload.parents ?? []);
      setDirectoryError('');
    } else {
      const message = payload.error ?? 'Parent accounts could not be loaded.';
      setDirectoryError(message);
      setNotice({ tone: 'error', message });
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
      parent?: OwnerParentAccount;
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
      setParentSearch('');
      setStatusFilter('all');
      setDirectoryError('');
      setNotice({ tone: 'success', message: `Parent @${cleanUsername} is ready to sign in.` });
      setBusy(null);
      void loadParents();
      return;
    } else {
      setNotice({ tone: 'error', message: payload.error ?? 'The parent account could not be created.' });
    }
    setBusy(null);
  }

  async function runAction(
    parent: OwnerParentAccount,
    action: 'suspend' | 'activate' | 'reset_password',
    nextPassword?: string,
  ) {
    setBusy(`${action}:${parent.user_id}`);
    setNotice(null);
    const { ok, payload } = await requestJson<{
      parent?: OwnerParentAccount;
      error?: string;
      message?: string;
    }>(`/api/owner/parents/${parent.user_id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, password: nextPassword }),
    });
    if (payload.parent) {
      setParents((current) =>
        current.map((item) =>
          item.user_id === payload.parent!.user_id ? { ...item, ...payload.parent! } : item,
        ),
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

  async function deleteParent(parent: OwnerParentAccount) {
    setBusy(`delete:${parent.user_id}`);
    setNotice(null);
    const { ok, payload } = await requestJson<{
      deletedUserId?: string;
      error?: string;
      message?: string;
    }>(`/api/owner/parents/${parent.user_id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: deleteConfirmation }),
    });
    if (ok && payload.deletedUserId === parent.user_id) {
      setParents((current) => current.filter((item) => item.user_id !== parent.user_id));
      if (expandedParent === parent.user_id) setExpandedParent(null);
      setConfirmDelete(null);
      setDeleteConfirmation('');
      setNotice({ tone: 'success', message: payload.message ?? 'Parent account deleted.' });
    } else {
      setNotice({ tone: 'error', message: payload.error ?? 'The parent account could not be deleted.' });
    }
    setBusy(null);
  }

  async function copyCredentials() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(
        `ISEE Arcade\nSign in: https://isee-arcade.vercel.app\nUsername: ${credentials.username}\nTemporary password: ${credentials.password}`,
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
                Direct parent login
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-[-.025em] text-white">
                Create a parent sign-in
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/52">
                Choose a username and password, create the account, then copy the details to give
                directly to the parent. Each parent can add and manage only their own children.
              </p>
            </div>
            <div className="rounded-2xl bg-black/20 px-4 py-3 text-right">
              <p className="text-2xl font-black text-white">
                {directoryError && parents.length === 0 ? '—' : parents.length}
              </p>
              <p className="text-[10px] font-black uppercase tracking-[.14em] text-white/38">
                parents added
              </p>
              <p className="mt-1 text-[11px] font-bold text-emerald-100/80">
                {directoryError && parents.length === 0
                  ? 'List unavailable'
                  : `${activeCount} active · ${neverUsedCount} never used`}
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
                  className="-mr-2 inline-flex min-h-11 items-center px-2 normal-case tracking-normal text-cyan-200 hover:text-cyan-100"
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
            <p className="mt-1 text-xs text-emerald-100/55">
              They can sign in at isee-arcade.vercel.app and add their own family.
            </p>
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
              Parent directory
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">Parents you have added</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/50">
              Open a parent to see whether they added children and the last date anyone in that
              household used ISEE Arcade. Learning answers and passwords stay private.
            </p>
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

        {parents.length > 0 && (
          <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(15rem,1fr)_auto_auto] lg:items-center">
            <label className="block">
              <span className="sr-only">Find a parent or child</span>
              <input
                type="search"
                value={parentSearch}
                onChange={(event) => setParentSearch(event.target.value)}
                placeholder="Find a parent or child"
                className="min-h-11 w-full rounded-xl bg-white/[0.06] px-4 text-base text-white outline-none ring-1 ring-white/10 placeholder:text-white/32 focus:ring-2 focus:ring-violet-200 md:text-sm"
              />
            </label>
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-black/20 p-1" aria-label="Filter parents">
              {(['all', 'active', 'suspended', 'removed'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  aria-pressed={statusFilter === status}
                  className={`min-h-11 rounded-lg px-2 text-[11px] font-black capitalize transition ${
                    statusFilter === status
                      ? 'bg-violet-200 text-[#171226]'
                      : 'text-white/48 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
            <label className="flex min-h-11 items-center gap-2 rounded-xl bg-black/20 px-3 ring-1 ring-white/10">
              <span className="text-xs font-bold text-white/70">Sort</span>
              <select
                value={sortBy}
                onChange={(event) =>
                  setSortBy(event.target.value as 'recent' | 'least' | 'newest')
                }
                className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none"
                style={{ colorScheme: 'dark' }}
                aria-label="Sort parent accounts"
              >
                <option value="recent">Recently used</option>
                <option value="least">Least used</option>
                <option value="newest">Newest added</option>
              </select>
            </label>
          </div>
        )}

        {busy === 'load' && parents.length === 0 ? (
          <p className="mt-6 rounded-2xl bg-white/[0.04] px-5 py-8 text-center text-sm text-white/45">
            Loading parent accounts…
          </p>
        ) : directoryError && parents.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-rose-300/[0.07] px-5 py-8 text-center">
            <p className="text-sm font-black text-rose-100">Parent list didn’t load</p>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-rose-100/70">
              The accounts are still saved. Check the connection and try loading the list again.
            </p>
            <button
              type="button"
              onClick={() => void loadParents()}
              disabled={busy !== null}
              className="mt-4 min-h-11 rounded-xl bg-rose-200 px-4 text-sm font-black text-[#2a1018] disabled:opacity-45"
            >
              Try again
            </button>
          </div>
        ) : parents.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center">
            <div className="text-3xl" aria-hidden="true">⌁</div>
            <p className="mt-3 text-sm font-black text-white">No parent accounts yet</p>
            <p className="mt-1 text-xs text-white/42">Create the first private sign-in above.</p>
          </div>
        ) : visibleParents.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 px-5 py-9 text-center">
            <p className="text-sm font-black text-white">No parents match this view</p>
            <button
              type="button"
              onClick={() => {
                setParentSearch('');
                setStatusFilter('all');
              }}
              className="mt-3 min-h-11 rounded-xl bg-white/[0.07] px-4 text-xs font-black text-violet-100"
            >
              Show every parent
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {visibleParents.map((parent) => {
              const rowBusy = busy !== null;
              const resettingThis = resetting === parent.user_id;
              const deletingThis = confirmDelete === parent.user_id;
              const expanded = expandedParent === parent.user_id;
              const familyPanelId = `parent-family-${parent.user_id}`;
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
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-black text-white">@{parent.username}</h3>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[.12em] ring-1 ${statusClass(parent.status)}`}
                        >
                          {statusLabel(parent.status)}
                        </span>
                      </div>
                      <div className="mt-3 grid max-w-xl grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
                        <div>
                          <p className="text-[11px] font-bold text-white/65">Children</p>
                          <p className="mt-0.5 text-sm font-black text-white">
                            {parent.children.length === 0
                              ? 'None added'
                              : `${parent.children.length} added`}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-white/65">Last used</p>
                          <p
                            className={`mt-0.5 text-sm font-black ${
                              parent.last_used_at ? 'text-emerald-100' : 'text-amber-100'
                            }`}
                            title={
                              parent.last_used_at
                                ? new Date(parent.last_used_at).toLocaleString('en-US')
                                : 'No parent sign-in or child activity recorded'
                            }
                          >
                            {formatActivityDate(parent.last_used_at)}
                          </p>
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <p className="text-[11px] font-bold text-white/65">Account created</p>
                          <p className="mt-0.5 text-sm font-bold text-white/80">
                            {formatDate(parent.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedParent(expanded ? null : parent.user_id)
                      }
                      aria-expanded={expanded}
                      aria-controls={familyPanelId}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-200/12 px-3 text-xs font-black text-violet-100 ring-1 ring-violet-200/15 transition hover:bg-violet-200/18"
                    >
                      {expanded ? 'Hide family' : 'View family'}
                      <span
                        aria-hidden="true"
                        className={`text-sm transition-transform ${expanded ? 'rotate-180' : ''}`}
                      >
                        ↓
                      </span>
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.07] pt-4">
                    {parent.status !== 'removed' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setResetting(resettingThis ? null : parent.user_id);
                            setResetPassword('');
                            setConfirmDelete(null);
                            setDeleteConfirmation('');
                          }}
                          disabled={rowBusy}
                          className="min-h-11 rounded-xl bg-white/[0.07] px-3 text-xs font-black text-white/70 hover:bg-white/10"
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
                          className="min-h-11 rounded-xl bg-amber-200/10 px-3 text-xs font-black text-amber-100 hover:bg-amber-200/15"
                        >
                          {parent.status === 'active' ? 'Suspend' : 'Restore'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDelete(deletingThis ? null : parent.user_id);
                            setDeleteConfirmation('');
                            setResetting(null);
                          }}
                          disabled={rowBusy}
                          className="min-h-11 rounded-xl bg-rose-300/10 px-3 text-xs font-black text-rose-100 hover:bg-rose-300/15"
                        >
                          Delete parent
                        </button>
                      </>
                    )}
                    {parent.status === 'removed' && (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDelete(deletingThis ? null : parent.user_id);
                          setDeleteConfirmation('');
                          setResetting(null);
                        }}
                        disabled={rowBusy}
                        className="min-h-11 rounded-xl bg-rose-300/10 px-3 text-xs font-black text-rose-100 hover:bg-rose-300/15"
                      >
                        Delete permanently
                      </button>
                    )}
                  </div>

                  {expanded && (
                    <section
                      id={familyPanelId}
                      aria-label={`Family details for ${parent.username}`}
                      className="mt-4 border-t border-white/[0.08] pt-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="text-base font-black text-white">Family profiles</h4>
                          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/70">
                            This shows child names, levels, and household activity dates only.
                            Answers and passwords are not visible.
                          </p>
                        </div>
                        <p className="text-xs font-bold text-white/70">
                          Household last used:{' '}
                          <span className="text-white">
                            {formatActivityDate(parent.last_used_at)}
                          </span>
                        </p>
                      </div>

                      {parent.children.length === 0 ? (
                        <div className="mt-4 border-y border-white/[0.07] py-7 text-center">
                          <p className="text-sm font-black text-white">No children added yet</p>
                          <p className="mt-1 text-xs text-white/70">
                            This parent has an account but has not created a child profile.
                          </p>
                        </div>
                      ) : (
                        <div className="mt-4 divide-y divide-white/[0.07] border-y border-white/[0.07]">
                          {parent.children.map((child) => {
                            const character = getCharacter(child.avatar_id);
                            return (
                              <div
                                key={child.id}
                                className="flex flex-wrap items-center gap-3 py-3"
                              >
                                <div
                                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
                                  style={{ background: `${character.accent}18` }}
                                >
                                  <CharacterFace character={character} size={42} />
                                </div>
                                <div className="min-w-40 flex-1">
                                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                    <p className="font-black text-white">{child.display_name}</p>
                                    <p className="text-xs font-bold text-cyan-100">
                                      @{child.username}
                                    </p>
                                  </div>
                                  <p className="mt-0.5 text-xs text-white/70">
                                    {GRADE_BAND_LABELS[child.grade_band]}
                                  </p>
                                </div>
                                <div className="min-w-32 text-left sm:text-right">
                                  <p className="text-[11px] font-bold text-white/65">
                                    Last profile activity
                                  </p>
                                  <p className="mt-0.5 text-sm font-black text-white">
                                    {formatActivityDate(child.last_used_at)}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  )}

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
                        className="min-h-11 min-w-56 flex-1 rounded-lg bg-white/[0.07] px-3 text-base text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-cyan-300 md:text-sm"
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

                  {deletingThis && (
                    <div className="mt-4 rounded-xl bg-rose-300/[0.07] p-4">
                      <p className="text-sm font-black text-rose-100">
                        Permanently delete @{parent.username}?
                      </p>
                      <p className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-rose-100/75">
                        This removes the parent sign-in and their family’s children, answers, and
                        learning records. This cannot be undone.
                      </p>
                      <label className="mt-4 block max-w-sm">
                        <span className="mb-1.5 block text-xs font-bold text-rose-100/80">
                          Type {parent.username} to confirm
                        </span>
                        <input
                          value={deleteConfirmation}
                          onChange={(event) =>
                            setDeleteConfirmation(normalizeAccountUsername(event.target.value))
                          }
                          autoCapitalize="none"
                          autoComplete="off"
                          className="min-h-11 w-full rounded-lg bg-black/20 px-3 text-base text-white outline-none ring-1 ring-rose-200/20 focus:ring-2 focus:ring-rose-200 md:text-sm"
                        />
                      </label>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDelete(null);
                            setDeleteConfirmation('');
                          }}
                          className="min-h-11 rounded-lg bg-white/[0.06] px-3 text-xs font-black text-white/70"
                        >
                          Keep account
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteParent(parent)}
                          disabled={rowBusy || deleteConfirmation !== parent.username}
                          className="min-h-11 rounded-lg bg-rose-300 px-3 text-xs font-black text-[#2a1018]"
                        >
                          {busy === `delete:${parent.user_id}` ? 'Deleting…' : 'Delete permanently'}
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
