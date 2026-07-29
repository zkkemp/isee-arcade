'use client';

import { useState, type FormEvent } from 'react';
import { usernameAuthEmail } from '@/lib/accountUsername';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type Notice = { tone: 'success' | 'error'; message: string };

export default function ParentAccountSettings({
  username,
  isOwner,
}: {
  username: string;
  isOwner: boolean;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!/^[A-Za-z0-9]{6,64}$/.test(newPassword)) {
      setNotice({
        tone: 'error',
        message: 'Use 6–64 characters containing only letters or numbers.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice({ tone: 'error', message: 'The new passwords do not match. Enter them again.' });
      return;
    }
    if (newPassword === currentPassword) {
      setNotice({ tone: 'error', message: 'Choose a new password that is different from the current one.' });
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice({ tone: 'error', message: 'Password changes are unavailable right now.' });
      return;
    }

    setBusy(true);
    setNotice(null);
    const verified = await supabase.auth.signInWithPassword({
      email: usernameAuthEmail(username),
      password: currentPassword,
    });
    if (verified.error || !verified.data.user) {
      setBusy(false);
      setCurrentPassword('');
      setNotice({
        tone: 'error',
        message: 'The current password is not correct. Try again or ask the owner for a reset.',
      });
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) {
      setNotice({
        tone: 'error',
        message: 'Your password could not be changed. Check the connection and try again.',
      });
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setNotice({ tone: 'success', message: 'Your new password is saved and ready for your next sign-in.' });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[.72fr_1.28fr]">
      <section className="self-start rounded-2xl bg-[#151527] p-5 shadow-[0_18px_50px_rgba(0,0,0,.24)] sm:p-6">
        <p className="text-xs font-bold text-white/45">{isOwner ? 'Owner account' : 'Parent account'}</p>
        <h2 className="mt-2 text-2xl font-black text-white">@{username}</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/55">
          This username stays the same. Your password protects every child and report in this
          family.
        </p>
        <p className="mt-5 rounded-xl bg-amber-200/[0.07] px-4 py-3 text-xs leading-relaxed text-amber-100/75">
          {isOwner
            ? 'Keep the owner password somewhere safe. Parent reset tools cannot reset the owner account.'
            : 'If you forget the current password, the ISEE Arcade owner can issue a temporary reset.'}
        </p>
      </section>

      <section className="rounded-2xl bg-[#151527] p-5 shadow-[0_18px_50px_rgba(0,0,0,.24)] sm:p-6">
        <h2 className="text-xl font-black text-white">Change my password</h2>
        <p className="mt-1 text-sm text-white/52">
          First confirm the password you use now, then choose a new one.
        </p>

        <form onSubmit={(event) => void changePassword(event)} className="mt-6 space-y-4">
          <PasswordField
            label="Current password"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
            visible={showPasswords}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <PasswordField
              label="New password"
              hint="6–64 letters or numbers"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              visible={showPasswords}
            />
            <PasswordField
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              visible={showPasswords}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold text-white/60">
              <input
                type="checkbox"
                checked={showPasswords}
                onChange={(event) => setShowPasswords(event.target.checked)}
                className="h-4 w-4 accent-cyan-200"
              />
              Show passwords
            </label>
            <button
              type="submit"
              disabled={
                busy ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword
              }
              className="min-h-12 rounded-xl bg-cyan-200 px-5 text-sm font-black text-[#071821] transition hover:bg-cyan-100 active:scale-[.99] disabled:opacity-40"
            >
              {busy ? 'Saving new password…' : 'Save new password'}
            </button>
          </div>
        </form>

        {notice && (
          <p
            role="status"
            className={`mt-5 rounded-xl px-4 py-3 text-sm font-bold ${
              notice.tone === 'success'
                ? 'bg-emerald-300/10 text-emerald-100'
                : 'bg-rose-300/10 text-rose-100'
            }`}
          >
            {notice.message}
          </p>
        )}
      </section>
    </div>
  );
}

function PasswordField({
  label,
  hint,
  value,
  onChange,
  autoComplete,
  visible,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  visible: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex min-h-5 items-center justify-between gap-3 text-sm font-black text-white/74">
        {label}
        {hint && <span className="text-[11px] font-bold text-white/38">{hint}</span>}
      </span>
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) =>
          onChange(event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 64))
        }
        autoComplete={autoComplete}
        required
        className="min-h-12 w-full rounded-xl bg-white/[0.07] px-4 text-base text-white outline-none ring-1 ring-white/10 transition focus:ring-2 focus:ring-cyan-200"
      />
    </label>
  );
}
