import { expect, test } from '@playwright/test';

const API = process.env.API_URL ?? 'http://localhost:4000';
const RW = `${API}/api/countries/RW`;

test.describe('Discovery (real server, seeded dev DB)', () => {
  test('landing: six categories, Teaching first, price and disclaimer from the database', async ({ request }) => {
    const b = await (await request.get(`${RW}/landing`)).json();
    expect(b.categories).toHaveLength(6);
    expect(b.categories[0]).toMatchObject({ slug: 'teaching-positions', featured: true });
    expect(b.popularSearches).toHaveLength(5);
    expect(b.plan.priceLabel).toBe('RWF 2,000');
    expect(b.country.disclaimer).toContain('not affiliated with MIFOTRA or REB');
    expect(b.featuredTests.length).toBeGreaterThan(0);
  });

  test('Flow A start: Teaching → Secondary Mathematics → free test details, no account needed', async ({ request }) => {
    const list = await (await request.get(`${RW}/mock-tests`, { params: { category: 'teaching-positions', q: 'Secondary Mathematics' } })).json();
    expect(list.results.map((r: { title: string }) => r.title)).toContain('Secondary Mathematics Teacher (S1–S3) — Mock 1');
    const free = list.results.find((r: { isFree: boolean }) => r.isFree);
    const detail = await (await request.get(`${RW}/mock-tests/${free.slug}`)).json();
    expect(detail.access).toMatchObject({ state: 'FREE', canStart: true, requiresAccount: false });
    expect(detail.noOfficialPassMark).toBe(true);
    expect(detail.sections.length).toBeGreaterThan(0);
  });

  test('Flow B start: search "Accountant" → paid test is locked with RWF 2,000 and a free sample', async ({ request }) => {
    const list = await (await request.get(`${RW}/mock-tests`, { params: { q: 'Accountant' } })).json();
    const paid = list.results.find((r: { isFree: boolean }) => !r.isFree);
    expect(paid.accessTag).toBe('FULL_ACCESS');
    const d = await (await request.get(`${RW}/mock-tests/${paid.slug}`)).json();
    expect(d.access).toMatchObject({ state: 'LOCKED', canStart: false, needsFullAccess: true });
    expect(d.pricing.priceLabel).toBe('RWF 2,000');
    expect(d.freeSample.slug).toBe('accountant-free-sample');
    expect(d.sections.some((s: { questionType: string }) => s.questionType.startsWith('Case-based'))).toBe(true);
  });

  test('unknown search → empty state → request this exam', async ({ request }) => {
    const none = await (await request.get(`${RW}/mock-tests`, { params: { q: 'Veterinary officer' } })).json();
    expect(none).toMatchObject({ total: 0, empty: true, canRequestExam: true });
    const req = await request.post(`${RW}/exam-requests`, { data: { query: 'Veterinary officer', email: `vet.seeker.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com` } });
    expect(req.status()).toBe(201);
  });

  test('Kenya is hidden from the public until it goes live', async ({ request }) => {
    for (const path of ['landing', 'mock-tests', 'pricing']) {
      const res = await request.get(`${API}/api/countries/KE/${path}`);
      expect(res.status(), path).toBe(404);
    }
  });

  test('responses never contain answers or explanations', async ({ request }) => {
    const text = [
      await (await request.get(`${RW}/mock-tests`)).text(),
      await (await request.get(`${RW}/mock-tests/accountant-public-institution-mock-1`)).text(),
    ].join('');
    expect(text).not.toMatch(/explanation|"correct"|"payload"/);
  });

  test('pricing page data: free samples RWF 0, Full Access paid once for 30 days', async ({ request }) => {
    const b = await (await request.get(`${RW}/pricing`)).json();
    expect(b.free.priceLabel).toBe('RWF 0');
    expect(b.fullAccess).toMatchObject({ priceLabel: 'RWF 2,000', durationDays: 30, paidOnce: true, autoRenew: false });
  });
});
