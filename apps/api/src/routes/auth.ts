import { timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { Prisma, type User } from '@prisma/client';
import { z } from 'zod';
import { emailInput } from '../domain/email';
import { badRequest, conflict, forbidden, notFound, tooMany, unauthorized } from '../http/errors';
import type { Ctx } from '../http/context';
import { claimGuestAttempts } from '../services/claim';
import {
  authorizeUrl, createState, exchangeCode, GoogleError, GOOGLE_STATE_COOKIE, GOOGLE_STATE_TTL_SECONDS, googleConfigured, readState, safeNext,
  type GoogleIdentity,
} from '../services/google';
import { assertOtpAllowed, requestOtp, verifyOtp } from '../services/otp';
import { hashPassword, PASSWORD_MAX, PASSWORD_MIN, verifyAgainstDummy, verifyPassword } from '../services/password';
import { createReset, resetLimit, resetTokenHash } from '../services/password-reset';
import { publicUser } from '../services/public-user';
import {
  createSession, destroySession, loadActiveRoles, parseCookies, SESSION_COOKIE, SESSION_TTL_DAYS,
} from '../services/session';
import type { FetchLike } from '../payments/types';

export { publicUser };

const HOME_COUNTRY = 'RW';
const countryCode = z.string().length(2).transform((s) => s.toUpperCase());
const guestTokens = z.array(z.string().min(8).max(100)).max(20).default([]);
const password = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

const signUpSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: emailInput,
  password,
  countryCode: countryCode.optional(),
  guestTokens,
});
const verifySchema = z.object({ email: emailInput, code: z.string().regex(/^\d{6}$/), guestTokens });
const emailOnly = z.object({ email: emailInput });
const signInSchema = z.object({
  email: emailInput,
  // Not the 8-character rule: sign-in must not say anything about what passwords are accepted.
  password: z.string().min(1).max(PASSWORD_MAX * 2),
  remember: z.boolean().optional(),
  guestTokens,
});
const resetSchema = z.object({ token: z.string().min(20).max(200), password });

/** Persistent (30 days) when `persistent`, otherwise a browser-session cookie: no Max-Age, no Expires. */
export function setSessionCookie(ctx: Ctx, res: Response, token: string, expiresAt: Date, persistent = true) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.config.NODE_ENV === 'production',
    path: '/',
    ...(persistent ? { expires: expiresAt, maxAge: SESSION_TTL_DAYS * 86_400_000 } : {}),
  });
}

const equalStrings = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

const googleCookiePath = '/api/auth/google';

export function authRouter(ctx: Ctx) {
  const { prisma, config } = ctx;
  const router = Router();
  const otpDeps = { prisma, config, email: ctx.email, now: ctx.now };
  const mailDeps = otpDeps;

  const startSession = async (req: Request, res: Response, user: User, remember: boolean) => {
    const session = await createSession(prisma, config.SESSION_SECRET, user.id, ctx.now(), req.get('user-agent'), remember);
    setSessionCookie(ctx, res, session.token, session.expiresAt, remember);
    const roles = (await loadActiveRoles(prisma, user.id)).map((r) => r.role.name);
    return publicUser(user, roles);
  };

  /** Which sign-in methods the web app should offer. */
  router.get('/providers', (_req, res) => {
    res.json({ google: googleConfigured(config) });
  });

  // ── Sign up: creates an UNVERIFIED account and emails the 6-digit code. No session until the code is entered.
  router.post('/sign-up', async (req, res) => {
    const body = signUpSchema.parse(req.body);
    const country = await prisma.country.findUnique({ where: { code: body.countryCode ?? HOME_COUNTRY } });
    if (!country) throw badRequest('invalid_country');
    if (body.countryCode && country.status !== 'LIVE') throw badRequest('country_not_available');

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing?.emailVerifiedAt) throw conflict('account_exists');

    // Limits first, so a refused request changes nothing.
    await assertOtpAllowed(otpDeps, { email: body.email, purpose: 'VERIFY_EMAIL' });
    const passwordHash = await hashPassword(body.password);
    try {
      if (existing) {
        // The address is not verified yet: whoever signs up last (and then proves the address) owns the account.
        await prisma.user.update({ where: { id: existing.id }, data: { name: body.name, passwordHash } });
      } else {
        await prisma.user.create({
          data: { email: body.email, name: body.name, passwordHash, countryCode: country.code, language: country.languages[0] ?? 'en' },
        });
      }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw conflict('account_exists');
      throw e;
    }
    const out = await requestOtp(otpDeps, { email: body.email, purpose: 'VERIFY_EMAIL' });
    res.status(201).json({ status: 'verification_required', email: body.email, ...out });
  });

  // ── Verify the address with the emailed code (used once per account), then sign in.
  router.post('/verify-email', async (req, res) => {
    const body = verifySchema.parse(req.body);
    await verifyOtp(otpDeps, { email: body.email, purpose: 'VERIFY_EMAIL', code: body.code });
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    // An already verified account never signs in with a code, whatever happens to be in the table.
    if (!user || user.emailVerifiedAt) throw badRequest('invalid_code');
    if (user.status !== 'ACTIVE') throw forbidden('account_suspended');

    const at = ctx.now();
    const verified = await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: at, lastSeenAt: at } });
    await prisma.otpCode.updateMany({ where: { email: body.email, purpose: 'VERIFY_EMAIL', consumedAt: null }, data: { consumedAt: at } });
    const { claimed } = await claimGuestAttempts(prisma, verified, body.guestTokens);
    res.json({ user: await startSession(req, res, verified, true), claimedAttempts: claimed });
  });

  // ── A new verification code. The same answer whether or not an unverified account exists (limits apply either way).
  router.post('/verify-email/resend', async (req, res) => {
    const { email } = emailOnly.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    const out = await requestOtp(otpDeps, { email, purpose: 'VERIFY_EMAIL', deliver: !!user && !user.emailVerifiedAt && user.status === 'ACTIVE' });
    res.json({ ok: true, ...out });
  });

  // ── Sign in with email + password.
  router.post('/sign-in', async (req, res) => {
    const body = signInSchema.parse(req.body);
    const at = ctx.now();
    const user = await prisma.user.findUnique({ where: { email: body.email } });

    // A locked account is refused BEFORE the password is looked at.
    if (user?.signInLockedUntil && user.signInLockedUntil > at) {
      throw tooMany('too_many_attempts', Math.ceil((user.signInLockedUntil.getTime() - at.getTime()) / 1000));
    }

    const ok = user?.passwordHash ? await verifyPassword(body.password, user.passwordHash) : await verifyAgainstDummy(body.password);
    if (!user || !ok) {
      if (user) {
        // Every existing account counts failures the same way (also one with no password), so the lock reveals nothing extra.
        const { failedSignIns } = await prisma.user.update({ where: { id: user.id }, data: { failedSignIns: { increment: 1 } }, select: { failedSignIns: true } });
        if (failedSignIns >= config.SIGN_IN_MAX_FAILURES) {
          const lockedUntil = new Date(at.getTime() + config.SIGN_IN_LOCK_MINUTES * 60_000);
          await prisma.user.update({ where: { id: user.id }, data: { failedSignIns: 0, signInLockedUntil: lockedUntil } });
          throw tooMany('too_many_attempts', config.SIGN_IN_LOCK_MINUTES * 60);
        }
      }
      throw unauthorized('invalid_credentials');
    }

    if (user.status !== 'ACTIVE') throw forbidden('account_suspended');
    if (!user.emailVerifiedAt) {
      await prisma.user.update({ where: { id: user.id }, data: { failedSignIns: 0, signInLockedUntil: null } });
      throw forbidden('email_not_verified'); // no code is sent automatically: the screen offers "Resend verification"
    }

    const signedIn = await prisma.user.update({
      where: { id: user.id },
      data: { failedSignIns: 0, signInLockedUntil: null, lastSeenAt: at },
    });
    const { claimed } = await claimGuestAttempts(prisma, signedIn, body.guestTokens);
    res.json({ user: await startSession(req, res, signedIn, body.remember === true), claimedAttempts: claimed });
  });

  router.post('/sign-out', async (req, res) => {
    if (req.sessionToken) await destroySession(prisma, config.SESSION_SECRET, req.sessionToken);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  // ── Forgot password: always the same answer. The caps only decide whether an email is sent.
  router.post('/forgot-password', async (req, res) => {
    const { email } = emailOnly.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && user.status === 'ACTIVE' && !(await resetLimit(mailDeps, user.id))) {
      const { message } = await createReset(mailDeps, user);
      // Not awaited: the time an SMTP server takes must not tell a caller whether the address has an account.
      void ctx.email.send(message).catch((e: unknown) => console.error(`[${req.id}] reset email failed:`, e instanceof Error ? e.message : 'error'));
    }
    res.json({ ok: true });
  });

  /** "For <email>" on the reset screen. */
  router.get('/reset-password/check', async (req, res) => {
    const { token } = z.object({ token: z.string().min(1).max(200) }).parse(req.query);
    const row = await prisma.passwordReset.findUnique({ where: { tokenHash: resetTokenHash(config, token) }, include: { user: true } });
    if (!row || row.usedAt || row.expiresAt <= ctx.now()) throw badRequest('invalid_or_expired_token');
    res.json({ email: row.user.email });
  });

  // ── Set a new password. Single use. Does NOT sign anyone in; every session of the person is ended.
  router.post('/reset-password', async (req, res) => {
    const body = resetSchema.parse(req.body);
    const at = ctx.now();
    const passwordHash = await hashPassword(body.password);
    const row = await prisma.passwordReset.findUnique({ where: { tokenHash: resetTokenHash(config, body.token) } });
    if (!row || row.usedAt || row.expiresAt <= at) throw badRequest('invalid_or_expired_token');
    await prisma.$transaction(async (tx) => {
      // The conditional update makes a replayed or concurrent use lose.
      const claimed = await tx.passwordReset.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: at } });
      if (claimed.count !== 1) throw badRequest('invalid_or_expired_token');
      const user = await tx.user.findUniqueOrThrow({ where: { id: row.userId } });
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? at, failedSignIns: 0, signInLockedUntil: null },
      });
      await tx.session.deleteMany({ where: { userId: row.userId } });
    });
    res.json({ ok: true });
  });

  // ── Continue with Google.
  router.get('/google/start', (req, res) => {
    if (!googleConfigured(config)) throw notFound('google_not_configured');
    const q = z.object({ next: z.string().optional(), countryCode: z.string().length(2).optional(), intent: z.enum(['sign_in', 'sign_up']).optional() }).safeParse(req.query);
    const next = safeNext(q.success ? q.data.next : undefined);
    const cc = q.success && q.data.countryCode ? q.data.countryCode.toUpperCase() : null;
    const intent = q.success ? (q.data.intent ?? null) : null;
    const { nonce, state } = createState(config.SESSION_SECRET, { next, countryCode: cc, intent }, ctx.now());
    res.cookie(GOOGLE_STATE_COOKIE, nonce, {
      httpOnly: true, sameSite: 'lax', secure: config.NODE_ENV === 'production', path: googleCookiePath, maxAge: GOOGLE_STATE_TTL_SECONDS * 1000,
    });
    res.redirect(302, authorizeUrl(config, state));
  });

  router.get('/google/callback', async (req, res) => {
    if (!googleConfigured(config)) throw notFound('google_not_configured');
    const web = config.WEB_ORIGIN.replace(/\/$/, '');
    const fail = () => {
      res.clearCookie(GOOGLE_STATE_COOKIE, { path: googleCookiePath });
      res.redirect(302, `${web}/sign-in?error=google_failed`);
    };
    try {
      const { code, state, error } = req.query as Record<string, unknown>;
      if (error || typeof code !== 'string' || code.length === 0) return fail();
      const payload = readState(config.SESSION_SECRET, state, ctx.now());
      const cookieNonce = parseCookies(req.headers.cookie)[GOOGLE_STATE_COOKIE];
      if (!payload || !cookieNonce || !equalStrings(cookieNonce, payload.n)) return fail();

      const identity = await exchangeCode(config, ctx.fetch ?? (fetch as unknown as FetchLike), code, ctx.now());
      const next = encodeURIComponent(safeNext(payload.next));
      const found = await existingUserForGoogle(identity);
      if (found === 'other_google') return fail();
      // "Sign in" with a Google account that has no JobPrep account: nothing is created; Sign up says so.
      if (!found && payload.i === 'sign_in') {
        res.clearCookie(GOOGLE_STATE_COOKIE, { path: googleCookiePath });
        return res.redirect(302, `${web}/sign-up?notice=google_no_account&next=${next}`);
      }
      const user = found ?? (await createUserForGoogle(identity, payload.cc));
      if (!user || user.status !== 'ACTIVE') return fail();

      const at = ctx.now();
      await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: at, failedSignIns: 0, signInLockedUntil: null } });
      await startSession(req, res, user, true);
      res.clearCookie(GOOGLE_STATE_COOKIE, { path: googleCookiePath });
      // "Create an account" with an address that already has one: signed in to it, and the next page says so.
      const notice = found && payload.i === 'sign_up' ? '&notice=account_exists' : '';
      res.redirect(302, `${web}/auth/callback?next=${next}${notice}`);
    } catch (e) {
      if (!(e instanceof GoogleError) && e instanceof Error) console.error(`[${req.id}] google sign-in failed:`, e.message);
      fail();
    }
  });

  /** Find by Google id, else by (Google-verified) email and link. `null` when the person has no account yet. */
  async function existingUserForGoogle(identity: GoogleIdentity): Promise<User | 'other_google' | null> {
    const at = ctx.now();
    const byGoogle = await prisma.user.findUnique({ where: { googleId: identity.sub } });
    if (byGoogle) return byGoogle;

    const byEmail = await prisma.user.findUnique({ where: { email: identity.email } });
    if (byEmail) {
      if (byEmail.googleId && byEmail.googleId !== identity.sub) return 'other_google'; // that address is tied to another Google account
      return prisma.user.update({
        where: { id: byEmail.id },
        data: {
          googleId: identity.sub,
          emailVerifiedAt: byEmail.emailVerifiedAt ?? at,
          // A password set while the address was unverified may have been set by someone else: drop it.
          ...(byEmail.emailVerifiedAt ? {} : { passwordHash: null }),
        },
      });
    }
    return null;
  }

  /** A verified account without a password, in the country the person chose (else the home country). */
  async function createUserForGoogle(identity: GoogleIdentity, stateCountry: string | null): Promise<User | null> {
    const at = ctx.now();
    const wanted = stateCountry ? await prisma.country.findUnique({ where: { code: stateCountry } }) : null;
    const country = wanted?.status === 'LIVE' ? wanted : await prisma.country.findUnique({ where: { code: HOME_COUNTRY } });
    if (!country) return null;
    return prisma.user.create({
      data: {
        email: identity.email,
        name: identity.name ?? identity.email.split('@')[0]!,
        googleId: identity.sub,
        emailVerifiedAt: at,
        countryCode: country.code,
        language: country.languages[0] ?? 'en',
      },
    });
  }

  return router;
}
