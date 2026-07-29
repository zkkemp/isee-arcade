import fs from 'node:fs';
import path from 'node:path';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const root = process.cwd();
const accountSource = fs.readFileSync(
  path.join(root, 'components', 'CloudAccount.tsx'),
  'utf8',
);
const accountSettingsSource = fs.readFileSync(
  path.join(root, 'components', 'parent', 'ParentAccountSettings.tsx'),
  'utf8',
);
const parentShellSource = fs.readFileSync(
  path.join(root, 'components', 'parent', 'ParentShell.tsx'),
  'utf8',
);
const ownerManagerSource = fs.readFileSync(
  path.join(root, 'components', 'owner', 'OwnerAccountManager.tsx'),
  'utf8',
);
const ownerRoute = fs.readFileSync(
  path.join(root, 'app', 'api', 'owner', 'parents', 'route.ts'),
  'utf8',
);
const ownerTargetRoute = fs.readFileSync(
  path.join(root, 'app', 'api', 'owner', 'parents', '[userId]', 'route.ts'),
  'utf8',
);
const adminClient = fs.readFileSync(
  path.join(root, 'lib', 'supabase', 'admin.ts'),
  'utf8',
);
const databaseClient = fs.readFileSync(
  path.join(root, 'lib', 'supabase', 'database.ts'),
  'utf8',
);
const parentDirectory = fs.readFileSync(
  path.join(root, 'lib', 'ownerParentAccounts.ts'),
  'utf8',
);
const migration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '202607270004_owner_managed_accounts.sql'),
  'utf8',
);
const bootstrap = fs.readFileSync(
  path.join(root, 'scripts', 'bootstrap-owner.ts'),
  'utf8',
);

assert(!accountSource.includes('.auth.signUp('), 'public account page must not offer Supabase signup');
assert(
  accountSource.includes('Accounts cannot be created from this page'),
  'sign-in page must explain private owner-issued access',
);
assert(
  accountSource.includes('accountStatus') &&
    accountSource.includes("data.status === 'active'"),
  'existing sessions must be rejected when an owner suspends or removes access',
);
assert(
  accountSettingsSource.includes('signInWithPassword') &&
    accountSettingsSource.includes('currentPassword') &&
    accountSettingsSource.includes('updateUser({ password: newPassword })'),
  'every signed-in parent must verify the current password before changing their own password',
);
assert(
  parentShellSource.includes("href: '/parent/account'") &&
    parentShellSource.includes("href: '/owner'"),
  'parent navigation must expose self-service account settings and owner-only parent management',
);
assert(
  ownerManagerSource.includes('Parents you have added') &&
    ownerManagerSource.includes('visibleParents') &&
    ownerManagerSource.includes("'reset_password'") &&
    ownerManagerSource.includes('Parent list didn’t load') &&
    ownerManagerSource.includes('Type {parent.username} to confirm') &&
    ownerManagerSource.includes('Delete permanently'),
  'the owner needs searchable parent management with resets and confirmed permanent deletion',
);
assert(
  ownerRoute.includes('getOwnerSession()') && ownerTargetRoute.includes('getOwnerSession()'),
  'every owner account route must re-check owner authorization on the server',
);
assert(
  ownerRoute.includes('listOwnerParentAccounts()') &&
    parentDirectory.includes("where account_role = 'parent'") &&
    !parentDirectory.includes("status = 'active'"),
  'the owner directory must use the pinned database and return active, suspended, and removed parents',
);
assert(
  ownerRoute.includes('hasSameOrigin(request)') &&
    ownerTargetRoute.match(/hasSameOrigin\(request\)/g)?.length === 2,
  'every mutating owner route must reject cross-origin requests',
);
assert(
  ownerTargetRoute.includes('admin.auth.admin.deleteUser(userId)') &&
    ownerTargetRoute.includes('delete from public.households') &&
    ownerTargetRoute.includes('confirmedUsername !== target.username'),
  'permanent parent deletion must require typed confirmation and clean up only orphaned family data',
);
assert(
  ownerRoute.includes('getIseeDatabase()') &&
    ownerRoute.includes('insert into public.parent_account_invites') &&
    !ownerRoute.includes('The invitation could not be secured.'),
  'direct parent login creation must prepare its internal authorization row without invitation UX',
);
assert(
  adminClient.includes("import 'server-only'") &&
    adminClient.includes('SUPABASE_SERVICE_ROLE_KEY') &&
    !adminClient.includes('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY'),
  'the service-role client must remain server-only',
);
assert(
  databaseClient.includes("const ISEE_PROJECT_REF = 'hgmupcysijskaowsrgbn'") &&
    databaseClient.includes('url.includes(ISEE_PROJECT_REF)'),
  'the direct database connection must remain pinned to the isolated ISEE project',
);
assert(
  migration.includes('hgmupcysijskaowsrgbn') &&
    migration.includes('Never run this in any KEMPCO/Chemco/FSM project'),
  'owner migration must be pinned to the isolated ISEE project boundary',
);
assert(
  migration.includes('before_auth_user_created_isee_arcade') &&
    migration.includes('require_owner_issued_account'),
  'the database must reject auth identities without an owner invitation',
);
assert(
  migration.includes("status in ('active', 'suspended', 'removed')") &&
    migration.includes('public.is_account_active(auth.uid())'),
  'suspended and removed parents must fail household RLS checks',
);
assert(
  migration.includes('grant select on table public.parent_accounts to authenticated') &&
    migration.includes('grant select, insert, update, delete on table public.learners to authenticated') &&
    migration.includes('grant select, insert, update on table public.learner_snapshots to authenticated') &&
    migration.includes('grant select, insert, update on table public.parent_preferences to authenticated'),
  'authenticated parents need explicit table privileges before PostgREST can evaluate family RLS',
);
assert(
  bootstrap.includes("EXPECTED_PROJECT_REF = 'hgmupcysijskaowsrgbn'") &&
    bootstrap.includes('owner already exists') &&
    bootstrap.includes("account_role: 'owner'"),
  'a fresh project needs a one-time, project-pinned owner bootstrap that closes permanently',
);

console.log(
  'Owner access audit: self-service password changes, complete parent directory, owner resets, ' +
    'direct credential creation, no public signup, server-only authorization, same-origin mutations, database authorization gate, ' +
    'active-account RLS, and isolated-project boundary passed.',
);
