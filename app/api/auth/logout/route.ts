import { NextResponse } from 'next/server';
import { childSessionCookie } from '@/lib/childSession';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(childSessionCookie.name, '', {
    ...childSessionCookie.options,
    maxAge: 0,
  });
  return response;
}
