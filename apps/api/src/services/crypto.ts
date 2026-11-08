import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Config } from '../config';

/**
 * Encryption at rest for interview data (transcripts, job descriptions, reports): AES-256-GCM.
 * Stored form: `v1:` + base64(iv[12] | tag[16] | ciphertext).
 */
export interface DataCipher {
  encrypt(plain: string): string;
  decrypt(stored: string): string;
}

const PREFIX = 'v1:';

export function createDataCipher(config: Pick<Config, 'DATA_ENCRYPTION_KEY' | 'SESSION_SECRET'>): DataCipher {
  const given = Buffer.from(config.DATA_ENCRYPTION_KEY, 'base64');
  // Production refuses a missing key (config.ts); dev and tests derive a stable one so they need no extra setup.
  const key = given.length === 32 ? given : createHash('sha256').update(`data-key|${config.SESSION_SECRET}`).digest();
  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
      return PREFIX + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
    },
    decrypt(stored) {
      if (!stored.startsWith(PREFIX)) throw new Error('unknown ciphertext format');
      const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
      const d = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
      d.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
    },
  };
}
