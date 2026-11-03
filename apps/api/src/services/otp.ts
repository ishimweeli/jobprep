import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { OtpPurpose, PrismaClient } from '@prisma/client';
import type { Config } from '../config';
import { badRequest, tooMany } from '../http/errors';
import type { EmailProvider } from './email';

export interface OtpDeps {
  prisma: PrismaClient;
  config: Config;
  email: EmailProvider;
  now: () => Date;
}

const hashCode = (secret: string, email: string, purpose: OtpPurpose, code: string) =>
  createHmac('sha256', secret).update(`${email}|${purpose}|${code}`).digest('hex');

const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

/**
 * Throws 429 when the address has asked for a code too recently (cooldown) or too often (cap per hour).
 * Counted from the database so the limits hold across restarts and multiple API instances.
 */
export async function assertOtpAllowed(deps: OtpDeps, input: { email: string; purpose: OtpPurpose }) {
  const { prisma, config, now } = deps;
  const at = now();

  const last = await prisma.otpCode.findFirst({
    where: { email: input.email, purpose: input.purpose },
    orderBy: { createdAt: 'desc' },
  });
  if (last) {
    const wait = config.OTP_RESEND_COOLDOWN_SECONDS - (at.getTime() - last.createdAt.getTime()) / 1000;
    if (wait > 0) throw tooMany('otp_cooldown', Math.ceil(wait));
  }
  const lastHour = await prisma.otpCode.count({
    where: { email: input.email, purpose: input.purpose, createdAt: { gt: new Date(at.getTime() - 3_600_000) } },
  });
  if (lastHour >= config.OTP_MAX_PER_HOUR) throw tooMany('otp_hourly_limit', 3600);
}

/**
 * Create and send a code (after the limits above). `deliver:false` is used for addresses with no unverified
 * account: the caller gets the same response and the same limits, but no email is sent (a silent row is kept),
 * so the endpoint can't be used to discover who has an account.
 */
export async function requestOtp(
  deps: OtpDeps,
  input: { email: string; purpose: OtpPurpose; deliver?: boolean },
) {
  const { prisma, config, email, now } = deps;
  const at = now();
  await assertOtpAllowed(deps, input);

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.otpCode.create({
    data: {
      email: input.email,
      purpose: input.purpose,
      codeHash: hashCode(config.SESSION_SECRET, input.email, input.purpose, code),
      expiresAt: new Date(at.getTime() + config.OTP_TTL_SECONDS * 1000),
      // Same clock as the cooldown / expiry checks (the DB default would drift from an injected clock).
      createdAt: at,
    },
  });
  if (input.deliver !== false) {
    await email.send({
      to: input.email,
      subject: `Your JobPrep verification code: ${code}`,
      text: `Your JobPrep verification code is ${code}.

It works for ${Math.round(config.OTP_TTL_SECONDS / 60)} minutes. Enter it to verify your email address. Never share it with anyone. If you did not create a JobPrep account, ignore this email.`,
    });
  }
  return { cooldownSeconds: config.OTP_RESEND_COOLDOWN_SECONDS, expiresInSeconds: config.OTP_TTL_SECONDS };
}

/** Verify against the newest unconsumed code. Wrong guesses are counted; too many burns the code. */
export async function verifyOtp(
  deps: OtpDeps,
  input: { email: string; purpose: OtpPurpose; code: string },
) {
  const { prisma, config, now } = deps;
  const at = now();
  const row = await prisma.otpCode.findFirst({
    where: { email: input.email, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) throw badRequest('invalid_code'); // note: unknown addresses also get a (silent) row, so this never reveals who has an account
  if (row.expiresAt <= at) throw badRequest('code_expired');
  if (row.attempts >= config.OTP_MAX_ATTEMPTS) throw badRequest('too_many_attempts', { triesLeft: 0 });

  const ok = safeEqual(row.codeHash, hashCode(config.SESSION_SECRET, input.email, input.purpose, input.code));
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
