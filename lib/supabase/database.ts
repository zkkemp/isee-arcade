import 'server-only';

import postgres, { type Sql } from 'postgres';

let database: Sql | null = null;

export function getIseeDatabase(): Sql | null {
  const url = process.env.SUPABASE_DB_URL?.trim() ?? '';
  if (!url.startsWith('postgres')) return null;
  if (!database) {
    database = postgres(url, {
      max: 2,
      idle_timeout: 20,
      connect_timeout: 12,
      prepare: false,
    });
  }
  return database;
}
