import type { NextRequest } from 'next/server';
import { refreshSupabaseSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  return refreshSupabaseSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|apple-touch-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
