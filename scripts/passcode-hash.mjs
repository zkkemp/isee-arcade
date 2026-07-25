/**
 * Prints the SHA-256 hash of a passcode, for NEXT_PUBLIC_PASSCODE_SHA256.
 *
 * Usage: npm run passcode -- 1234
 */
import { createHash } from 'node:crypto';

const code = process.argv[2];
if (!code) {
  console.error('Usage: npm run passcode -- <passcode>');
  process.exit(1);
}

const hash = createHash('sha256').update(code, 'utf8').digest('hex');
console.log(`\npasscode: ${code}`);
console.log(`NEXT_PUBLIC_PASSCODE_SHA256=${hash}\n`);
console.log('Set that variable in Vercel (or .env.local) and redeploy.');
console.log('Leave it unset to disable the gate entirely.\n');
