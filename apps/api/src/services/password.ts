import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing with node:crypto scrypt (no extra dependency).
 * Stored format is self-describing so the cost can be raised later without breaking old hashes:
 *   scrypt$N$r$p$<salt base64url>$<hash base64url>
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const N = 16_384; // 2^14: about 16 MB and a few tens of ms per hash
const R = 8;
const P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;
/** Upper bounds accepted when reading a stored hash, so a corrupted row cannot make us allocate gigabytes. */
const MAX_N = 1 << 17;
const MAX_R = 16;
const MAX_P = 4;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, keyLen: number): Promise<Buffer> {
  const opts: ScryptOptions = { N: n, r, p, maxmem: 256 * n * r + 1024 * 1024 };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, keyLen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await derive(password, salt, N, R, P, KEY_LEN);
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

/** Constant-time comparison of the derived key. A malformed stored hash never matches. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![n, r, p].every(Number.isInteger) || n < 2 || (n & (n - 1)) !== 0 || n > MAX_N || r < 1 || r > MAX_R || p < 1 || p > MAX_P) return false;
  const salt = Buffer.from(parts[4]!, 'base64url');
  const expected = Buffer.from(parts[5]!, 'base64url');
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = await derive(password, salt, n, r, p, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;

/**
 * Spend the same time as a real check when there is no password to compare against (unknown email, or an account
 * with no password), so response time does not reveal which addresses have accounts. Always returns false.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword('jobprep-dummy-password');
  await verifyPassword(password, await dummyHash);
  return false;
}
