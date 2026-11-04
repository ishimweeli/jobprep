import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { DEFAULT_LEGAL, LEGAL_SLUGS, type LegalPage, type LegalSection, type LegalSlug } from '../domain/legal';
import { notFound } from '../http/errors';
import type { Ctx } from '../http/context';

export const legalKey = (slug: string, country: string) => `legal.page:${slug}:${country}`;

export const legalSectionSchema = z.object({
  id: z.string().trim().min(1).max(40).regex(/^[a-z0-9-]+$/).optional(),
  heading: z.string().trim().min(2).max(120),
  paragraphs: z.array(z.string().trim().min(1).max(4000)).min(1).max(30),
});

export const idOfHeading = (s: string, i: number) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `section-${i + 1}`;

/** The page for a country: its own text if an admin entered one, else the all-countries text ('*'), else the placeholder. */
export async function loadLegalPage(ctx: Ctx, slug: LegalSlug, countryCode: string | null): Promise<LegalPage> {
  const keys = [...(countryCode ? [legalKey(slug, countryCode)] : []), legalKey(slug, '*')];
  const rows = await ctx.prisma.setting.findMany({ where: { key: { in: keys } } });
  const row = keys.map((k) => rows.find((r) => r.key === k)).find(Boolean);
  if (row && row.value && typeof row.value === 'object' && !Array.isArray(row.value)) {
    const v = row.value as { title?: string; lastUpdated?: string; intro?: string; sections?: LegalSection[] };
    const base = DEFAULT_LEGAL[slug];
    return {
      slug, placeholder: false, title: v.title ?? base.title, lastUpdated: v.lastUpdated ?? row.updatedAt.toISOString().slice(0, 10),
      intro: v.intro ?? '', sections: Array.isArray(v.sections) ? v.sections : base.sections,
    };
  }
  return { slug, placeholder: true, ...DEFAULT_LEGAL[slug] };
}

/** Public, country-neutral routes: legal pages and the maintenance flag. */
export function publicRouter(ctx: Ctx) {
  const router = Router();
  const { prisma } = ctx;

  const slugParam = z.enum(LEGAL_SLUGS);
  const countryOf = async (raw: unknown) => {
    if (typeof raw !== 'string' || raw === '') return null;
    const c = await prisma.country.findUnique({ where: { code: raw.toUpperCase() } });
    if (!c) throw notFound('country_not_found');
    return c;
  };

  router.get('/legal', async (req, res) => {
    const country = await countryOf(req.query.country);
    const pages = await Promise.all(LEGAL_SLUGS.map((s) => loadLegalPage(ctx, s, country?.code ?? null)));
    res.json({ pages: pages.map((p) => ({ slug: p.slug, title: p.title, lastUpdated: p.lastUpdated, placeholder: p.placeholder })) });
  });

  router.get('/legal/:page', async (req, res) => {
    const parsed = slugParam.safeParse(req.params.page);
    if (!parsed.success) throw notFound('legal_page_not_found');
    const country = await countryOf(req.query.country);
    const page = await loadLegalPage(ctx, parsed.data, country?.code ?? null);
    res.json({ ...page, country: country && { code: country.code, name: country.name, disclaimer: country.disclaimer } });
  });

  /** Maintenance switch (set by an admin in Settings). The API keeps answering; the web app shows the "we'll be back" page. */
  router.get('/status', async (_req, res) => {
    const row = await prisma.setting.findUnique({ where: { key: 'system.maintenance' } });
    const v = (row?.value ?? {}) as Prisma.JsonObject;
    res.json({
      ok: true,
      maintenance: {
        enabled: v.enabled === true,
        message: typeof v.message === 'string' && v.message ? v.message : null,
        backAt: typeof v.backAt === 'string' && v.backAt ? v.backAt : null,
      },
    });
  });

  return router;
}
