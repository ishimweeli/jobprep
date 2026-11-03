import { scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../../src/services/password';

describe('password hashing (scrypt)', () => {
  it('uses a self-describing format with a random salt', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(a).not.toBe(b); // different salts
    expect(a).not.toContain('correct horse');
  });

  it('verifies the right password and rejects wrong ones', async () => {
    const h = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', h)).toBe(true);
    expect(await verifyPassword('correct horse batterz', h)).toBe(false);
    expect(await verifyPassword('', h)).toBe(false);
    expect(await verifyPassword('Correct horse battery', h)).toBe(false);
  });

  it('handles unicode (normalised) and the 128-character maximum', async () => {
    const h = await hashPassword('pässwörd-long');
    expect(await verifyPassword('pässwörd-long', h)).toBe(true); // same text, composed differently
    const long = 'x'.repeat(128);
    expect(await verifyPassword(long, await hashPassword(long))).toBe(true);
  });

  it('reads the cost from the stored hash, so old hashes keep working when the cost is raised', async () => {
    const salt = Buffer.from('0123456789abcdef');
    const key = scryptSync('legacy password', salt, 32, { N: 1024, r: 8, p: 1 });
    const stored = ['scrypt', 1024, 8, 1, salt.toString('base64url'), key.toString('base64url')].join('$');
    expect(await verifyPassword('legacy password', stored)).toBe(true);
    expect(await verifyPassword('other password', stored)).toBe(false);
  });

  it.each([
    ['empty', ''],
    ['wrong scheme', 'bcrypt$16384$8$1$c2FsdA$aGFzaA'],
    ['too few parts', 'scrypt$16384$8$1$c2FsdA'],
    ['non-numeric cost', 'scrypt$abc$8$1$c2FsdA$aGFzaA'],
    ['cost not a power of two', 'scrypt$1000$8$1$c2FsdA$aGFzaA'],
    ['cost far too high', `scrypt$${2 ** 30}$8$1$c2FsdA$aGFzaA`],
    ['empty salt', 'scrypt$16384$8$1$$aGFzaA'],
    ['empty hash', 'scrypt$16384$8$1$c2FsdA$'],
  ])('a malformed stored hash (%s) never matches and never throws', async (_name, stored) => {
    expect(await verifyPassword('anything', stored)).toBe(false);
  });

  it('the dummy check takes real work and always says no', async () => {
    const t0 = performance.now();
    expect(await verifyAgainstDummy('anything')).toBe(false);
    expect(await verifyAgainstDummy('anything')).toBe(false);
    expect(performance.now() - t0).toBeGreaterThan(5);
  });
});
