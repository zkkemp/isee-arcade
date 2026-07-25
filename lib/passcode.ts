/**
 * Optional passcode gate.
 *
 * This is a "keep strangers out" speed bump, not security. The app is a static
 * site, so any check runs on the client and a determined person can bypass it by
 * reading the bundle. Storing a SHA-256 hash rather than the plaintext at least
 * keeps the passcode itself out of the shipped JavaScript.
 *
 * Set NEXT_PUBLIC_PASSCODE_SHA256 to enable it. Unset (the default locally)
 * means no gate, so dev stays frictionless. Generate a hash with:
 *   npm run passcode -- 1234
 */
export const PASSCODE_HASH = (process.env.NEXT_PUBLIC_PASSCODE_SHA256 ?? '').trim().toLowerCase();

export const PASSCODE_ENABLED = PASSCODE_HASH.length === 64;

export const UNLOCK_KEY = 'isee-arcade:unlocked';

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
