import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { ConsoleEmailProvider } from '../../src/services/email';
import { resetAndSeed, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const config = testConfig();
const app = createApp({ prisma, config, email: new ConsoleEmailProvider(() => {}) });

beforeAll(() => resetAndSeed(prisma));
afterAll(() => prisma.$disconnect());

describe('GET /sitemap.xml', () => {
  it('lists the live country, its catalog, job pages and published mock tests as absolute URLs', async () => {
    const res = await request(app).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    const base = config.WEB_ORIGIN.replace(/\/+$/, '');
    const locs = [...res.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? '');
    expect(locs).toContain(`${base}/`);
    expect(locs).toContain(`${base}/rw`);
    expect(locs).toContain(`${base}/rw/tests`);
    expect(locs.some((l) => l.startsWith(`${base}/rw/tests/jobs/`))).toBe(true);
    expect(locs.some((l) => /\/rw\/tests\/(?!jobs\/)[^/]+$/.test(l))).toBe(true);
  });

  it('leaves out countries that are not live, drafts and private pages', async () => {
    const res = await request(app).get('/sitemap.xml');
    expect(res.text).not.toMatch(/\/ke(\/|<)/);
    expect(res.text).not.toMatch(/\/(admin|account|sign-in|exam)\b/);
    const drafts = await prisma.mockTest.findMany({ where: { NOT: { status: 'PUBLISHED' } }, select: { slug: true } });
    for (const d of drafts) expect(res.text).not.toContain(`/tests/${d.slug}<`);
  });
});
