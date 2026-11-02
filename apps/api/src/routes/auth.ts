import { Router, type Response } from 'express';
import type { Country, User } from '@prisma/client';
import { z } from 'zod';
import { normalizePhone } from '../domain/phone';
import { badRequest, conflict, forbidden } from '../http/errors';
import type { Ctx } from '../http/context';
import { claimGuestAttempts } from '../services/claim';
import { requestOtp, verifyOtp } from '../services/otp';
import { createSession, destroySession, SESSION_COOKIE, SESSION_TTL_DAYS } from '../services/session';

const countryCode = z.string().length(2).transform((s) => s.toUpperCase());
const phoneInput = z.string().min(6).max(24);
const guestTokens = z.array(z.string().min(8).max(100)).max(20).default([]);

const requestSchema = z.object({
  purpose: z.enum(['sign_up', 'sign_in']),
  phone: phoneInput,
  countryCode: countryCode.optional(),
});
const signUpSchema = z.object({
  countryCode,
  phone: phoneInput,
  name: z.string().trim().min(2).max(80),
  code: z.string().regex(/^\d{6}$/),
  guestTokens,
});
const signInSchema = z.object({
  phone: phoneInput,
  countryCode: countryCode.optional(),
  code: z.string().regex(/^\d{6}$/),
  guestTokens,
});

export function publicUser(u: User) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    countryCode: u.countryCode,
    goalCategoryId: u.goalCategoryId,
    language: u.language,
  };
}

export function setSessionCookie(ctx: Ctx, res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.config.NODE_ENV === 'production',
    expires: expiresAt,
    maxAge: SESSION_TTL_DAYS * 86_400_000,
    path: '/',
  });
}

/** Resolve the country a phone belongs to: explicit code, else the dial-code prefix. */
async function countryForPhone(ctx: Ctx, phone: string, code?: string): Promise<{ country: Country; e164: string } | null> {
  if (code) {
    const country = await ctx.prisma.country.findUnique({ where: { code } });
    const e164 = country && normalizePhone(phone, country.dialCode);
    return country && e164 ? { country, e164 } : null;
  }
  for (const country of await ctx.prisma.country.findMany()) {
    if (phone.trim().startsWith(country.dialCode)) {
      const e164 = normalizePhone(phone, country.dialCode);
      if (e164) return { country, e164 };
    }
  }
  return null;
}

export function authRouter(ctx: Ctx) {
  const router = Router();
  const otpDeps = { prisma: ctx.prisma, config: ctx.config, sms: ctx.sms, now: ctx.now };

  router.post('/otp/request', async (req, res) => {
    const body = requestSchema.parse(req.body);
    const target = await countryForPhone(ctx, body.phone, body.countryCode);
    if (!target) throw badRequest('invalid_phone');
    const existing = await ctx.prisma.user.findUnique({ where: { phone: target.e164 } });

    if (body.purpose === 'sign_up') {
      if (target.country.status !== 'LIVE') throw badRequest('country_not_available');
      // Telling someone their number already has an account is needed for sign-up UX.
      if (existing) throw conflict('account_exists');
      return res.json(await requestOtp(otpDeps, { phone: target.e164, purpose: 'SIGN_UP' }));
    }
    // Sign-in: identical response whether or not the account exists (no account discovery).
    res.json(await requestOtp(otpDeps, { phone: target.e164, purpose: 'SIGN_IN', deliver: !!existing }));
  });

  router.post('/sign-up', async (req, res) => {
    const body = signUpSchema.parse(req.body);
    const target = await countryForPhone(ctx, body.phone, body.countryCode);
    if (!target) throw badRequest('invalid_phone');
    if (target.country.status !== 'LIVE') throw badRequest('country_not_available');

    await verifyOtp(otpDeps, { phone: target.e164, purpose: 'SIGN_UP', code: body.code });
    if (await ctx.prisma.user.findUnique({ where: { phone: target.e164 } })) throw conflict('account_exists');

    const user = await ctx.prisma.user.create({
      data: {
        countryCode: target.country.code,
        phone: target.e164,
        name: body.name,
        language: target.country.languages[0] ?? 'en',
      },
    });
    const { claimed } = await claimGuestAttempts(ctx.prisma, user, body.guestTokens);
    const session = await createSession(ctx.prisma, ctx.config.SESSION_SECRET, user.id, ctx.now(), req.get('user-agent'));
    setSessionCookie(ctx, res, session.token, session.expiresAt);
    res.status(201).json({ user: publicUser(user), claimedAttempts: claimed });
  });

  router.post('/sign-in', async (req, res) => {
    const body = signInSchema.parse(req.body);
    const target = await countryForPhone(ctx, body.phone, body.countryCode);
    if (!target) throw badRequest('invalid_phone');

    await verifyOtp(otpDeps, { phone: target.e164, purpose: 'SIGN_IN', code: body.code });
    const user = await ctx.prisma.user.findUnique({ where: { phone: target.e164 } });
    if (!user) throw badRequest('invalid_code');
    if (user.status !== 'ACTIVE') throw forbidden('account_suspended');

    const { claimed } = await claimGuestAttempts(ctx.prisma, user, body.guestTokens);
    await ctx.prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: ctx.now() } });
    const session = await createSession(ctx.prisma, ctx.config.SESSION_SECRET, user.id, ctx.now(), req.get('user-agent'));
    setSessionCookie(ctx, res, session.token, session.expiresAt);
    res.json({ user: publicUser(user), claimedAttempts: claimed });
  });

  router.post('/sign-out', async (req, res) => {
    if (req.sessionToken) await destroySession(ctx.prisma, ctx.config.SESSION_SECRET, req.sessionToken);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  return router;
}
