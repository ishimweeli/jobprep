import { Router } from 'express';
import type { Ctx } from '../http/context';

const STATIC_PATHS = ['/terms', '/privacy', '/refund', '/cookies', '/help'];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Entry { path: string; lastmod?: Date; changefreq: 'daily' | 'weekly' | 'monthly'; priority: string }

/**
 * `GET /sitemap.xml`: every public page search engines should index, built from the database so a newly
 * published job or mock test is listed without a redeploy. Only LIVE countries and PUBLISHED mock tests appear
 * (the same visibility rule as the catalog API). Mounted outside `/api`, before the static web server.
 */
export function sitemapRouter({ prisma, config }: Ctx) {
  const router = Router();
  const base = config.WEB_ORIGIN.replace(/\/+$/, '');

  router.get('/sitemap.xml', async (_req, res) => {
    const [countries, tests] = await Promise.all([
      prisma.country.findMany({ where: { status: 'LIVE' }, select: { slug: true, code: true } }),
      prisma.mockTest.findMany({
        where: { status: 'PUBLISHED', country: { status: 'LIVE' } },
        select: { slug: true, updatedAt: true, country: { select: { slug: true } }, exam: { select: { slug: true } } },
      }),
    ]);

    const entries: Entry[] = [{ path: '/', changefreq: 'weekly', priority: '1.0' }];
    for (const c of countries) {
      entries.push({ path: `/${c.slug}`, changefreq: 'daily', priority: '1.0' });
      entries.push({ path: `/${c.slug}/tests`, changefreq: 'daily', priority: '0.9' });
      entries.push({ path: `/${c.slug}/pricing`, changefreq: 'monthly', priority: '0.6' });
    }

    const jobs = new Map<string, Entry>();
    for (const t of tests) {
      const jobPath = `/${t.country.slug}/tests/jobs/${t.exam.slug}`;
      const job = jobs.get(jobPath);
      if (!job) jobs.set(jobPath, { path: jobPath, lastmod: t.updatedAt, changefreq: 'weekly', priority: '0.8' });
      else if (job.lastmod && t.updatedAt > job.lastmod) job.lastmod = t.updatedAt;
      entries.push({ path: `/${t.country.slug}/tests/${t.slug}`, lastmod: t.updatedAt, changefreq: 'weekly', priority: '0.7' });
    }
    entries.push(...jobs.values());
    for (const p of STATIC_PATHS) entries.push({ path: p, changefreq: 'monthly', priority: '0.3' });

    const body = entries
      .map((e) =>
        `  <url>\n    <loc>${esc(base + e.path)}</loc>\n` +
        (e.lastmod ? `    <lastmod>${e.lastmod.toISOString()}</lastmod>\n` : '') +
        `    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`)
      .join('\n');

    res
      .type('application/xml')
      .set('Cache-Control', 'public, max-age=3600')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
  });

  return router;
}
