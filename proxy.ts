import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { refreshSupabaseSession } from '@/lib/supabase/proxy';
import { childSessionCookie, verifyChildSession } from '@/lib/childSession';
import { isSupabaseConfigured, supabaseConfig } from '@/lib/supabase/config';

export async function proxy(request: NextRequest) {
  const response = await refreshSupabaseSession(request);
  const protectedArcade =
    request.nextUrl.pathname.startsWith('/play/') ||
    request.nextUrl.pathname === '/prep' ||
    request.nextUrl.pathname === '/progress';
  if (!protectedArcade) return response;

  const child = await verifyChildSession(request.cookies.get(childSessionCookie.name)?.value);
  if (child) return response;

  let parentSignedIn = false;
  if (isSupabaseConfigured()) {
    const { url, publishableKey } = supabaseConfig();
    const supabase = createServerClient(url, publishableKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => undefined,
      },
    });
    const { data } = await supabase.auth.getClaims();
    const parentId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
    if (parentId) {
      const { data: account } = await supabase
        .from('parent_accounts')
        .select('status')
        .eq('user_id', parentId)
        .maybeSingle();
      parentSignedIn = account?.status === 'active';
    }
  }
  if (parentSignedIn) return response;

  const login = request.nextUrl.clone();
  login.pathname = '/';
  login.search = '';
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|apple-touch-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
