import { createClient } from '@supabase/supabase-js';
import { normalizeAccountUsername, usernameAuthEmail } from '../lib/accountUsername';

const EXPECTED_PROJECT_REF = 'hgmupcysijskaowsrgbn';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
const username = normalizeAccountUsername(process.env.OWNER_USERNAME ?? '');
const password = process.env.OWNER_PASSWORD ?? '';

if (!url.includes(EXPECTED_PROJECT_REF)) {
  throw new Error('Refusing owner bootstrap: Supabase URL is not the isolated ISEE Arcade project.');
}
if (serviceRoleKey.length <= 40) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.');
}
if (username.length < 3) {
  throw new Error('OWNER_USERNAME must contain at least 3 letters or numbers.');
}
if (!/^[A-Za-z0-9]{6,64}$/.test(password)) {
  throw new Error('OWNER_PASSWORD must be 6–64 letters or numbers.');
}

const admin = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const { count: ownerCount, error: ownerCountError } = await admin
  .from('platform_admins')
  .select('user_id', { count: 'exact', head: true });
if (ownerCountError) throw new Error('The owner table could not be checked.');
if ((ownerCount ?? 0) > 0) {
  throw new Error('The ISEE Arcade owner already exists. Bootstrap is permanently closed.');
}

const email = usernameAuthEmail(username);
await admin
  .from('parent_account_invites')
  .delete()
  .eq('auth_email', email)
  .is('consumed_at', null)
  .lt('expires_at', new Date().toISOString());

const { data: invite, error: inviteError } = await admin
  .from('parent_account_invites')
  .insert({
    username,
    auth_email: email,
    account_role: 'owner',
    created_by: null,
  })
  .select('id')
  .single();
if (inviteError || !invite) throw new Error('The one-time owner invitation could not be created.');

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { username, account_type: 'owner' },
});
if (error || !data.user) {
  await admin.from('parent_account_invites').delete().eq('id', invite.id);
  throw new Error('The owner account could not be created.');
}

console.log(`ISEE Arcade owner @${username} created. The password was not printed.`);
