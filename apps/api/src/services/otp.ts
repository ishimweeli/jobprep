import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { OtpPurpose, PrismaClient } from '@prisma/client';
import type { Config } from '../config';
import { badRequest, tooMany } from '../http/errors';
import type { SmsProvider } from './sms';

export interface OtpDeps {
  prisma: PrismaClient;
  config: Config;
  sms: SmsProvider;
  now: () => Date;
}

const hashCode = (secret: string, phone: string, purpose: OtpPurpose, code: string) =>
  createHmac('sha256', secret).update(`${phone}|${purpose}|${code}`).digest('hex');

const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

/**
 * Create and send a code. Limits (per phone + purpose): a resend cooldown, and a cap per hour,
 * both counted from the database so they hold across restarts and multiple API instances.
 * `deliver:false` is used for unknown numbers on sign-in: the caller gets the same response
 * but no SMS is sent, so the endpoint can't be used to discover who has an account.
 */
export async function requestOtp(
  deps: OtpDeps,
  input: { phone: string; purpose: OtpPurpose; deliver?: boolean },
) {
  const { prisma, config, sms, now } = deps;
  const at = now();

  const last = await prisma.otpCode.findFirst({
    where: { phone: input.phone, purpose: input.purpose },
    orderBy: { createdAt: 'desc' },
  });
  if (last) {
    const wait = config.OTP_RESEND_COOLDOWN_SECONDS - (at.getTime() - last.createdAt.getTime()) / 1000;
    if (wait > 0) throw tooMany('otp_cooldown', Math.ceil(wait));
  }
  const lastHour = await prisma.otpCode.count({
    where: { phone: input.phone, purpose: input.purpose, createdAt: { gt: new Date(at.getTime() - 3_600_000) } },
  });
  if (lastHour >= config.OTP_MAX_PER_HOUR) throw tooMany('otp_hourly_limit', 3600);

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.otpCode.create({
    data: {
      phone: input.phone,
      purpose: input.purpose,
      codeHash: hashCode(config.SESSION_SECRET, input.phone, input.purpose, code),
      expiresAt: new Date(at.getTime() + config.OTP_TTL_SECONDS * 1000),
      // Same clock as the cooldown / expiry checks (the DB default would drift from an injected clock).
      createdAt: at,
    },
  });
  if (input.deliver !== false) {
    await sms.send(input.phone, `Your JobPrep code is ${code}. It expires in ${Math.round(config.OTP_TTL_SECONDS / 60)} minutes. Never share it.`);
  }
  return { cooldownSeconds: config.OTP_RESEND_COOLDOWN_SECONDS, expiresInSeconds: config.OTP_TTL_SECONDS };
}

/** Verify against the newest unconsumed code. Wrong guesses are counted; too many burns the code. */
export async function verifyOtp(
  deps: OtpDeps,
  input: { phone: string; purpose: OtpPurpose; code: string },
) {
  const { prisma, config, now } = deps;
  const at = now();
  const row = await prisma.otpCode.findFirst({
    where: { phone: input.phone, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) throw badRequest('invalid_code'); // note: unknown numbers also get a (silent) row, so this never reveals who has an account
  if (row.expiresAt <= at) throw badRequest('code_expired');
  if (row.attempts >= config.OTP_MAX_ATTEMPTS) throw badRequest('too_many_attempts', { triesLeft: 0 });

  const ok = safeEqual(row.codeHash, hashCode(config.SESSION_SECRET, input.phone, input.purpose, input.code));
  if (!ok) {
    await prisma.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    throw badRequest('invalid_code', { triesLeft: Math.max(0, config.OTP_MAX_ATTEMPTS - (row.attempts + 1)) });
  }
  // Single use: the conditional update makes a replayed or concurrent verify lose.
  const consumed = await prisma.otpCode.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: at },
  });
  if (consumed.count !== 1) throw badRequest('invalid_code');
}
