const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

export function isSupabaseConfigured(): boolean {
  return url.startsWith('https://') && publishableKey.length > 20;
}

export function supabaseConfig(): { url: string; publishableKey: string } {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'ISEE Arcade cloud sync is not configured. Add the separate ISEE Arcade Supabase URL and publishable key.',
    );
  }
  return { url, publishableKey };
}
