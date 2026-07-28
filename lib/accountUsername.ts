export const ACCOUNT_EMAIL_DOMAIN = 'accounts.isee-arcade.app';

export function normalizeAccountUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32);
}

/**
 * Supabase Auth uses an email-shaped identifier internally, but the family only
 * sees a username. No message is sent to this address; email confirmation must
 * be disabled for this username-only project.
 */
export function usernameAuthEmail(username: string): string {
  return `${normalizeAccountUsername(username)}@${ACCOUNT_EMAIL_DOMAIN}`;
}

export function usernameFromAuthEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const suffix = `@${ACCOUNT_EMAIL_DOMAIN}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : null;
}
