import { Router } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../http/errors';
import { requireUser, type Ctx } from '../http/context';
import { accessSummary } from '../services/access-summary';
import { claimGuestAttempts } from '../services/claim';
import { buildDashboard } from '../services/dashboard';
import { publicUser } from './auth';

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  goalCategoryId: z.string().min(1).nullable().optional(),
  language: z.string().min(2).max(5).optional(),
});
const switchSchema = z.object({
  countryCode: z.string().length(2).transform((s) => s.toUpperCase()),
  confirm: z.literal(true),
});
const claimSchema = z.object({ guestTokens: z.array(z.string().min(8).max(100)).min(1).max(20) });

export function meRouter(ctx: Ctx) {
  const router = Router();
  router.use(requireUser);

  const accessFor = (userId: string, countryCode: string) => accessSummary(ctx, userId, countryCode);

  router.get('/', async (req, res) => {
    const user = req.user!;
    const country = await ctx.prisma.country.findUniqueOrThrow({ where: { code: user.countryCode } });
    res.json({
      user: publicUser(user),
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
      },
    });
    res.json({ user: publicUser(updated) });
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
    res.json({
      from: { code: current.code, name: current.name },
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

    // Grants, attempts and payments are NOT touched: they stay attached to their own country.
    // The job goal belongs to the old country's categories, so it is cleared. Language resets to the new default.
    const updated = await ctx.prisma.user.update({
      where: { id: user.id },
      data: { countryCode: target.code, goalCategoryId: null, language: target.languages[0] ?? 'en' },
    });
    res.json({ user: publicUser(updated), access: await accessFor(user.id, target.code) });
  });

  router.post('/claim-attempts', async (req, res) => {
    const body = claimSchema.parse(req.body);
    res.json(await claimGuestAttempts(ctx.prisma, req.user!, body.guestTokens));
  });

  return router;
}
