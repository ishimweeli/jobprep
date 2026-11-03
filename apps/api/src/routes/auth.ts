import { Router, type Response } from 'express';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { emailInput } from '../domain/email';
import { badRequest, conflict, forbidden } from '../http/errors';
import type { Ctx } from '../http/context';
import { claimGuestAttempts } from '../services/claim';
import { requestOtp, verifyOtp } from '../services/otp';
import { createSession, destroySession, loadActiveRoles, SESSION_COOKIE, SESSION_TTL_DAYS } from '../services/session';

const countryCode = z.string().length(2).transform((s) => s.toUpperCase());
const guestTokens = z.array(z.string().min(8).max(100)).max(20).default([]);

const requestSchema = z.object({
  purpose: z.enum(['sign_up', 'sign_in']),
  email: emailInput,
  countryCode: countryCode.optional(),
});
const signUpSchema = z.object({
  countryCode,
  email: emailInput,
  name: z.string().trim().min(2).max(80),
  code: z.string().regex(/^\d{6}$/),
  guestTokens,
});
const signInSchema = z.object({
  email: emailInput,
  code: z.string().regex(/^\d{6}$/),
  guestTokens,
});

/** `roles` = codes of the person's active role assignments ([] for a plain candidate). */
export function publicUser(u: User, roles: string[] = []) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    countryCode: u.countryCode,
    goalCategoryId: u.goalCategoryId,
    language: u.language,
    roles,
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

export function authRouter(ctx: Ctx) {
  const router = Router();
  const otpDeps = { prisma: ctx.prisma, config: ctx.config, email: ctx.email, now: ctx.now };

  router.post('/otp/request', async (req, res) => {
    const body = requestSchema.parse(req.body);
    const existing = await ctx.prisma.user.findUnique({ where: { email: body.email } });

    if (body.purpose === 'sign_up') {
      if (!body.countryCode) throw badRequest('country_required');
      const country = await ctx.prisma.country.findUnique({ where: { code: body.countryCode } });
      if (!country) throw badRequest('invalid_country');
      if (country.status !== 'LIVE') throw badRequest('country_not_available');
      // Telling someone their address already has an account is needed for sign-up UX.
      if (existing) throw conflict('account_exists');
      return res.json(await requestOtp(otpDeps, { email: body.email, purpose: 'SIGN_UP' }));
    }
    // Sign-in: identical response whether or not the account exists (no account discovery).
    res.json(await requestOtp(otpDeps, { email: body.email, purpose: 'SIGN_IN', deliver: !!existing }));
  });

  router.post('/sign-up', async (req, res) => {
    const body = signUpSchema.parse(req.body);
    const country = await ctx.prisma.country.findUnique({ where: { code: body.countryCode } });
    if (!country) throw badRequest('invalid_country');
    if (country.status !== 'LIVE') throw badRequest('country_not_available');

    await verifyOtp(otpDeps, { email: body.email, purpose: 'SIGN_UP', code: body.code });
    if (await ctx.prisma.user.findUnique({ where: { email: body.email } })) throw conflict('account_exists');

    const user = await ctx.prisma.user.create({
      data: {
        countryCode: country.code,
        email: body.email,
        name: body.name,
        language: country.languages[0] ?? 'en',
      },
    });
    const { claimed } = await claimGuestAttempts(ctx.prisma, user, body.guestTokens);
    const session = await createSession(ctx.prisma, ctx.config.SESSION_SECRET, user.id, ctx.now(), req.get('user-agent'));
    setSessionCookie(ctx, res, session.token, session.expiresAt);
    res.status(201).json({ user: publicUser(user), claimedAttempts: claimed });
  });

  router.post('/sign-in', async (req, res) => {
    const body = signInSchema.parse(req.body);
    await verifyOtp(otpDeps, { email: body.email, purpose: 'SIGN_IN', code: body.code });
    const user = await ctx.prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw badRequest('invalid_code');
    if (user.status !== 'ACTIVE') throw forbidden('account_suspended');

    const { claimed } = await claimGuestAttempts(ctx.prisma, user, body.guestTokens);
    await ctx.prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: ctx.now() } });
    const session = await createSession(ctx.prisma, ctx.config.SESSION_SECRET, user.id, ctx.now(), req.get('user-agent'));
    setSessionCookie(ctx, res, session.token, session.expiresAt);
    const roles = (await loadActiveRoles(ctx.prisma, user.id)).map((r) => r.role.name);
    res.json({ user: publicUser(user, roles), claimedAttempts: claimed });
  });

  router.post('/sign-out', async (req, res) => {
    if (req.sessionToken) await destroySession(ctx.prisma, ctx.config.SESSION_SECRET, req.sessionToken);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  return router;
}
