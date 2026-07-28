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
  ownerRoute.includes('getOwnerSession()') && ownerTargetRoute.includes('getOwnerSession()'),
  'every owner account route must re-check owner authorization on the server',
);
assert(
  ownerRoute.includes('hasSameOrigin(request)') &&
    ownerTargetRoute.match(/hasSameOrigin\(request\)/g)?.length === 2,
  'every mutating owner route must reject cross-origin requests',
);
assert(
  adminClient.includes("import 'server-only'") &&
    adminClient.includes('SUPABASE_SERVICE_ROLE_KEY') &&
    !adminClient.includes('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY'),
  'the service-role client must remain server-only',
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
  bootstrap.includes("EXPECTED_PROJECT_REF = 'hgmupcysijskaowsrgbn'") &&
    bootstrap.includes('owner already exists') &&
    bootstrap.includes("account_role: 'owner'"),
  'a fresh project needs a one-time, project-pinned owner bootstrap that closes permanently',
);

console.log(
  'Owner access audit: no public signup, server-only authorization, same-origin mutations, ' +
    'database invitation gate, active-account RLS, and isolated-project boundary passed.',
);
