'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { setActiveProfile } from '@/lib/profiles';
import { setPlayerMode } from '@/lib/playerMode';

export default function AccountSignOutButton({
  className = '',
  label = 'Sign out',
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    await fetch('/api/auth/logout', { method: 'POST' });
    setActiveProfile(null);
    setPlayerMode(null);
    router.replace('/');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={busy}
      className={className}
    >
      {busy ? 'Signing out…' : label}
    </button>
  );
}
