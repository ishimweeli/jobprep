import { Router } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../http/errors';
import { emailInput } from '../domain/email';
import type { PrismaClient } from '@prisma/client';
import { formatMoney, isSellable } from '../domain/pricing';

/**
 * Public, country-scoped config. Price, currency and duration come from PlanConfig in the
 * database — never from code. A country with no price set reports `checkoutAvailable: false`.
 */
export function countriesRouter(prisma: PrismaClient) {
  const router = Router();

  router.get('/', async (_req, res) => {
    const countries = await prisma.country.findMany({ orderBy: { name: 'asc' } });
    res.json({
      countries: countries.map((c) => ({
        code: c.code,
        slug: c.slug,
        name: c.name,
        status: c.status,
        dialCode: c.dialCode,
        currencyCode: c.currencyCode,
        languages: c.languages,
        // Only live countries can be chosen at sign-up; others offer a waiting list.
        selectable: c.status === 'LIVE',
      })),
    });
  });

  /** Job categories for a country (sign-up goal picker, landing cards). Only that country's categories. */
  router.get('/:code/categories', async (req, res) => {
    const code = req.params.code.toUpperCase();
    const country = await prisma.country.findUnique({ where: { code } });
    if (!country) throw notFound('country_not_found');
    const categories = await prisma.category.findMany({
      where: { countryCode: code },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { mockTests: { where: { status: 'PUBLISHED' } } } } },
    });
    res.json({
      categories: categories.map((c) => ({
        id: c.id, slug: c.slug, name: c.name, description: c.description, icon: c.icon,
        featured: c.featured, mockTestCount: c._count.mockTests,
      })),
    });
  });

  /** "Notify me when Kenya opens" — only for countries that are not live yet. */
  router.post('/:code/waiting-list', async (req, res) => {
    const code = req.params.code.toUpperCase();
    const country = await prisma.country.findUnique({ where: { code } });
    if (!country) throw notFound('country_not_found');
    if (country.status === 'LIVE') throw badRequest('country_already_live');
    const { email } = z.object({ email: emailInput }).parse(req.body);
    await prisma.waitingListEntry.upsert({
      where: { countryCode_email: { countryCode: code, email } },
      create: { countryCode: code, email },
      update: {},
    });
    res.status(201).json({ ok: true });
  });

  router.get('/:code', async (req, res) => {
    const country = await prisma.country.findUnique({
      where: { code: req.params.code.toUpperCase() },
      include: {
        plans: { where: { active: true } },
        paymentMethods: { where: { mode: { not: 'DISABLED' } }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!country) return res.status(404).json({ error: 'country_not_found' });

    const plan = country.plans.find((p) => p.code === 'FULL_ACCESS') ?? null;
    res.json({
      code: country.code,
      name: country.name,
      status: country.status,
      dialCode: country.dialCode,
      languages: country.languages,
      disclaimer: country.disclaimer,
      plan: plan && {
        code: plan.code,
        name: plan.name,
        priceMinor: plan.priceMinor,
        priceLabel: formatMoney(plan.priceMinor, plan.currencyCode, country.currencyExponent),
        currencyCode: plan.currencyCode,
        durationDays: plan.durationDays,
        autoRenew: plan.autoRenew,
        checkoutAvailable: country.status === 'LIVE' && isSellable(plan),
      },
      paymentMethods: country.paymentMethods.map((m) => ({
        provider: m.provider, label: m.label, hint: m.hint, mode: m.mode,
      })),
    });
  });

  return router;
}
