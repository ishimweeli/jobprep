import { randomBytes } from 'node:crypto';
import type { PrismaClient, User } from '@prisma/client';
import type { Config } from '../config';
import { tooMany } from '../http/errors';
import type { EmailProvider } from './email';
import { hashToken } from './session';

export interface ResetDeps {
  prisma: PrismaClient;
  config: Config;
  email: EmailProvider;
  now: () => Date;
}

/** The reset link is the only secret in the email; it is never stored, only a keyed hash of it. */
export const resetLink = (config: Config, token: string) => `${config.WEB_ORIGIN.replace(/\/$/, '')}/reset-password?token=${token}`;

export const resetTokenHash = (config: Config, token: string) => hashToken(config.SESSION_SECRET, `password-reset|${token}`);

/**
 * Same limits as the verification code: a resend cooldown and a cap per hour, counted from the reset rows of the
 * account. Returns the seconds to wait (and why) instead of throwing, so the public endpoint can stay silent.
 */
export async function resetLimit(deps: ResetDeps, userId: string): Promise<{ code: 'otp_cooldown' | 'otp_hourly_limit'; retryAfterSeconds: number } | null> {
  const { prisma, config, now } = deps;
  const at = now();
  const last = await prisma.passwordReset.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
  if (last) {
    const wait = config.OTP_RESEND_COOLDOWN_SECONDS - (at.getTime() - last.createdAt.getTime()) / 1000;
    if (wait > 0) return { code: 'otp_cooldown', retryAfterSeconds: Math.ceil(wait) };
  }
  const lastHour = await prisma.passwordReset.count({ where: { userId, createdAt: { gt: new Date(at.getTime() - 3_600_000) } } });
  if (lastHour >= config.OTP_MAX_PER_HOUR) return { code: 'otp_hourly_limit', retryAfterSeconds: 3600 };
  return null;
}

/**
 * Create a reset token for the account (earlier unused ones stop working; they are marked used, not deleted, so the
 * hourly cap still counts them) and return the plain token and the message to send.
 */
export async function createReset(deps: ResetDeps, user: Pick<User, 'id' | 'email'>) {
  const { prisma, config, now } = deps;
  const at = now();
  const token = randomBytes(32).toString('base64url');
  await prisma.$transaction([
    prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: at } }),
    prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: resetTokenHash(config, token),
        expiresAt: new Date(at.getTime() + config.PASSWORD_RESET_TTL_SECONDS * 1000),
        createdAt: at,
      },
    }),
  ]);
  return {
    token,
    message: {
      to: user.email,
      subject: 'Reset your JobPrep password',
      text: `Someone asked to reset the password of your JobPrep account.

Choose a new password here:
${resetLink(config, token)}

The link works once and expires in ${Math.round(config.PASSWORD_RESET_TTL_SECONDS / 60)} minutes. If you did not ask for this, ignore this email: your password has not changed.`,
    },
  };
}

/** For the admin button: limits apply, and the caller learns about them (429 with the usual codes). */
export async function sendResetOrThrow(deps: ResetDeps, user: Pick<User, 'id' | 'email'>) {
  const limited = await resetLimit(deps, user.id);
  if (limited) throw tooMany(limited.code, limited.retryAfterSeconds);
  const { message } = await createReset(deps, user);
  await deps.email.send(message);
  return { cooldownSeconds: deps.config.OTP_RESEND_COOLDOWN_SECONDS, expiresInSeconds: deps.config.PASSWORD_RESET_TTL_SECONDS };
}
