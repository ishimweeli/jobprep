import { Router, type Request } from 'express';
import { z } from 'zod';
import { emailInput } from '../domain/email';
import { badRequest, conflict, notFound, tooMany } from '../http/errors';
import { requireUser, type Ctx } from '../http/context';
import { accessSummary } from '../services/access-summary';
import { claimGuestAttempts } from '../services/claim';
import { buildDashboard } from '../services/dashboard';
import { applyOnboarding, countryChangeData, onboardingSchema } from '../services/onboarding';
import { publicUser } from '../services/public-user';
import { requestOtp, verifyOtp } from '../services/otp';
import { hashPassword, PASSWORD_MAX, PASSWORD_MIN, verifyPassword } from '../services/password';
import { recommendTests } from '../services/recommend';
import { hashToken } from '../services/session';

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  goalCategoryId: z.string().min(1).nullable().optional(),
  language: z.string().min(2).max(5).optional(),
  level: z.string().trim().min(1).max(80).nullable().optional(),
  subject: z.string().trim().min(1).max(80).nullable().optional(),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
const newPassword = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);
const passwordSchema = z.object({ currentPassword: z.string().max(PASSWORD_MAX).optional(), newPassword });
const emailChangeSchema = z.object({ email: emailInput, password: z.string().max(PASSWORD_MAX).optional() });
const emailVerifySchema = z.object({ email: emailInput, code: z.string().regex(/^\d{6}$/) });
const switchSchema = z.object({
  countryCode: z.string().length(2).transform((s) => s.toUpperCase()),
  confirm: z.literal(true),
});
const claimSchema = z.object({ guestTokens: z.array(z.string().min(8).max(100)).min(1).max(20) });

/** "YYYY-MM-DD" -> a date; 400 invalid_exam_date for something like 2026-02-31. */
function examDate(v: string | null) {
  if (v === null) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw badRequest('invalid_exam_date');
  return d;
}

const roleCodes = (req: Request) => (req.userRoles ?? []).map((r) => r.role.name);

export function meRouter(ctx: Ctx) {
  const router = Router();
  router.use(requireUser);

  const accessFor = (userId: string, countryCode: string) => accessSummary(ctx, userId, countryCode);

  router.get('/', async (req, res) => {
    const user = req.user!;
    const country = await ctx.prisma.country.findUniqueOrThrow({ where: { code: user.countryCode } });
    res.json({
      user: publicUser(user, roleCodes(req)),
      country: { code: country.code, name: country.name, currencyCode: country.currencyCode, languages: country.languages },
      access: await accessFor(user.id, user.countryCode),
    });
  });

  /** Greeting, resume, recommended practice, score history, strong/weak topics, recent attempts, access. */
  router.get('/dashboard', async (req, res) => {
    const { category } = z.object({ category: z.string().max(80).optional() }).parse(req.query);
    res.json(await buildDashboard(ctx, req.user!, category));
  });

  router.patch('/', async (req, res) => {
    const user = req.user!;
    const body = patchSchema.parse(req.body);
    const country = await ctx.prisma.country.findUniqueOrThrow({ where: { code: user.countryCode } });

    if (body.goalCategoryId) {
      // The job goal must be one of THIS country's categories.
      const cat = await ctx.prisma.category.findFirst({ where: { id: body.goalCategoryId, countryCode: user.countryCode } });
      if (!cat) throw badRequest('invalid_goal');
    }
    if (body.language && !country.languages.includes(body.language)) throw badRequest('language_not_available');

    const updated = await ctx.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.goalCategoryId !== undefined && { goalCategoryId: body.goalCategoryId }),
        ...(body.language !== undefined && { language: body.language }),
        ...(body.level !== undefined && { level: body.level }),
        ...(body.subject !== undefined && { subject: body.subject }),
        ...(body.examDate !== undefined && { examDate: examDate(body.examDate) }),
      },
    });
    res.json({ user: publicUser(updated, roleCodes(req)) });
  });

  /**
   * Setup screens (country -> job category -> level, subject, exam date). Any subset of fields per call.
   * `finish` marks setup done; `skip` marks it done without level, subject or exam date.
   */
  router.patch('/onboarding', async (req, res) => {
    const body = onboardingSchema.parse(req.body);
    const updated = await applyOnboarding(ctx.prisma, req.user!, body, ctx.now());
    res.json({ user: publicUser(updated, roleCodes(req)) });
  });

  /** Data for the "Switch to Kenya?" confirmation sheet. */
  router.get('/country-change', async (req, res) => {
    const user = req.user!;
    const to = z.string().length(2).parse(req.query.to).toUpperCase();
    const target = await ctx.prisma.country.findUnique({
      where: { code: to },
      include: { plans: true, paymentMethods: { where: { mode: { not: 'DISABLED' } }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!target) throw notFound('country_not_found');
    const current = await ctx.prisma.country.findUniqueOrThrow({ where: { code: user.countryCode } });
    const access = await accessFor(user.id, user.countryCode);
    const goal = user.goalCategoryId ? await ctx.prisma.category.findUnique({ where: { id: user.goalCategoryId }, select: { id: true, name: true } }) : null;
    res.json({
      from: { code: current.code, name: current.name },
      // Switching clears the job goal (and level and subject) and asks for the new country's goal again.
      clearsGoal: !!goal && target.code !== current.code,
      currentGoal: goal,
      goalWillBeAskedAgain: true,
      to: {
        code: target.code, name: target.name, status: target.status, selectable: target.status === 'LIVE',
        currencyCode: target.currencyCode, paymentMethods: target.paymentMethods.map((m) => m.label),
      },
      // Mirrors the design: access in the old country keeps running, results are kept.
      currentAccess: access.current,
      keepsResults: true,
    });
  });

  router.post('/country', async (req, res) => {
    const user = req.user!;
    const body = switchSchema.parse(req.body);
    if (body.countryCode === user.countryCode) throw badRequest('already_in_country');
    const target = await ctx.prisma.country.findUnique({ where: { code: body.countryCode } });
    if (!target) throw notFound('country_not_found');
    if (target.status !== 'LIVE') throw badRequest('country_not_available');

    // Shared with the setup screen (services/onboarding): grants, attempts and payments are NOT touched; the job goal,
    // level and subject are cleared; the language resets to the new default.
    const updated = await ctx.prisma.user.update({ where: { id: user.id }, data: countryChangeData(user, target, ctx.now()) });
    res.json({ user: publicUser(updated, roleCodes(req)), access: await accessFor(user.id, target.code) });
  });

  /** Tests worth taking next, ranked by the person's subject and level (the same ranking as the dashboard). */
  router.get('/recommended-tests', async (req, res) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(20).default(3) }).parse(req.query);
    res.json(await recommendTests(ctx, req.user!, limit));
  });

  /** Wrong current passwords count towards the same 5-in-a-row lock as sign-in. */
  async function checkCurrentPassword(user: NonNullable<Request['user']>, given: string | undefined) {
    if (!user.passwordHash) return; // Google-only account: nothing to check
    if (!given) throw badRequest('current_password_required');
    const at = ctx.now();
    if (user.signInLockedUntil && user.signInLockedUntil > at) {
      throw tooMany('too_many_attempts', Math.ceil((user.signInLockedUntil.getTime() - at.getTime()) / 1000));
    }
    if (await verifyPassword(given, user.passwordHash)) {
      if (user.failedSignIns > 0) await ctx.prisma.user.update({ where: { id: user.id }, data: { failedSignIns: 0 } });
      return;
    }
    const { failedSignIns } = await ctx.prisma.user.update({ where: { id: user.id }, data: { failedSignIns: { increment: 1 } }, select: { failedSignIns: true } });
    if (failedSignIns >= ctx.config.SIGN_IN_MAX_FAILURES) {
      await ctx.prisma.user.update({ where: { id: user.id }, data: { failedSignIns: 0, signInLockedUntil: new Date(at.getTime() + ctx.config.SIGN_IN_LOCK_MINUTES * 60_000) } });
      throw tooMany('too_many_attempts', ctx.config.SIGN_IN_LOCK_MINUTES * 60);
    }
    throw badRequest('invalid_current_password');
  }

  /** Change (or, for a Google-only account, first set) the password. Other devices are signed out; this one stays. */
  router.post('/password', async (req, res) => {
    const body = passwordSchema.parse(req.body);
    const user = req.user!;
    await checkCurrentPassword(user, body.currentPassword);
    const hash = await hashPassword(body.newPassword);
    await ctx.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: hash, failedSignIns: 0, signInLockedUntil: null } });
      await tx.session.deleteMany({ where: { userId: user.id, ...(req.sessionToken && { NOT: { tokenHash: hashToken(ctx.config.SESSION_SECRET, req.sessionToken) } }) } });
    });
    res.json({ ok: true });
  });

  /** Step 1 of changing the email address: a code goes to the NEW address. Nothing changes until it is entered. */
  router.post('/email-change', async (req, res) => {
    const body = emailChangeSchema.parse(req.body);
    const user = req.user!;
    if (body.email === user.email) throw badRequest('same_email');
    await checkCurrentPassword(user, body.password);
    if (await ctx.prisma.user.findUnique({ where: { email: body.email }, select: { id: true } })) throw conflict('email_taken');
    res.json({ ok: true, ...(await requestOtp(ctx, { email: body.email, purpose: 'VERIFY_EMAIL' })) });
  });

  /** Step 2: the code proves the new address belongs to this person. */
  router.post('/email-change/verify', async (req, res) => {
    const body = emailVerifySchema.parse(req.body);
    const user = req.user!;
    if (body.email === user.email) throw badRequest('same_email');
    await verifyOtp(ctx, { email: body.email, purpose: 'VERIFY_EMAIL', code: body.code });
    try {
      const updated = await ctx.prisma.user.update({ where: { id: user.id }, data: { email: body.email, emailVerifiedAt: ctx.now() } });
      res.json({ user: publicUser(updated, roleCodes(req)) });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw conflict('email_taken'); // someone registered it in the meantime
      throw e;
    }
  });

  router.post('/claim-attempts', async (req, res) => {
    const body = claimSchema.parse(req.body);
    res.json(await claimGuestAttempts(ctx.prisma, req.user!, body.guestTokens));
  });

  return router;
}
