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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Kid passwords are deliberately simple, so a fast unsalted digest is not
 * appropriate once the credential can sync. PBKDF2 makes an offline guess much
 * more expensive while keeping the password itself off the device and cloud.
 */
export function newCredentialSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function passwordHash(password: string, salt: string): Promise<string> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(salt),
      iterations: 120_000,
    },
    material,
    256,
  );
  return bytesToHex(new Uint8Array(derived));
}

/** Compares fixed-length credential digests without exiting on the first mismatch. */
export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}
