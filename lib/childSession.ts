const COOKIE_NAME = 'isee-arcade-child';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export type ChildSession = {
  learnerId: string;
  householdId: string;
  expiresAt: number;
};

function secret(): string {
  return (
    process.env.ISEE_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ''
  );
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signature(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64Url(new Uint8Array(bytes));
}

export async function createChildSession(
  learnerId: string,
  householdId: string,
): Promise<string> {
  if (secret().length < 32) throw new Error('ISEE session signing is not configured.');
  const payload = base64Url(
    new TextEncoder().encode(
      JSON.stringify({
        learnerId,
        householdId,
        expiresAt: Date.now() + MAX_AGE_SECONDS * 1000,
      } satisfies ChildSession),
    ),
  );
  return `${payload}.${await signature(payload)}`;
}

export async function verifyChildSession(value: string | undefined): Promise<ChildSession | null> {
  if (!value || secret().length < 32) return null;
  const [payload, supplied] = value.split('.');
  if (!payload || !supplied || (await signature(payload)) !== supplied) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as ChildSession;
    if (
      typeof parsed.learnerId !== 'string' ||
      typeof parsed.householdId !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      parsed.expiresAt <= Date.now()
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export const childSessionCookie = {
  name: COOKIE_NAME,
  maxAge: MAX_AGE_SECONDS,
  options: {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  },
};
