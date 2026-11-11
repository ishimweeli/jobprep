import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { ConsoleEmailProvider } from '../../src/services/email';
import { resetAndSeed, signedInAgent, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const mail = new ConsoleEmailProvider(() => {});
const app = createApp({ prisma, config: testConfig(), email: mail });

beforeAll(() => resetAndSeed(prisma));
afterAll(() => prisma.$disconnect());

type Card = { slug: string; title: string; isFree: boolean; accessTag: string; category: { slug: string }; questionCount: number };
const list = async (qs = '') => (await request(app).get(`/api/countries/RW/mock-tests${qs}`)).body;
const titles = (body: { results: Card[] }) => body.results.map((r) => r.title);

describe('country gating', () => {
  it('only live countries are browsable; preparing and planned ones are hidden', async () => {
    for (const path of ['landing', 'mock-tests', 'pricing', 'mock-tests/secondary-mathematics-teacher-sample']) {
      const ke = await request(app).get(`/api/countries/KE/${path}`);
      expect(ke.status, `KE ${path}`).toBe(404);
      expect(ke.body.error).toBe('country_not_available');
    }
    expect((await request(app).get('/api/countries/UG/mock-tests')).body.error).toBe('country_not_available');
    expect((await request(app).get('/api/countries/XX/landing')).body.error).toBe('country_not_found');
  });

  it('Kenya tests exist in the database but never appear once Kenya is live in Rwanda’s catalogue', async () => {
    await prisma.country.update({ where: { code: 'KE' }, data: { status: 'LIVE' } });
    try {
      const rw = await list();
      const ke = (await request(app).get('/api/countries/KE/mock-tests')).body;
      expect(ke.total).toBe(2);
      const rwSlugs = new Set(rw.results.map((r: Card) => r.slug));
      expect(rwSlugs.has('secondary-mathematics-teacher-sample')).toBe(false);
      expect(rwSlugs.has('accountant-mock-1')).toBe(false);
      // Same title words, different country: "Accountant" in Rwanda never returns Kenya's test.
      expect(titles(await list('?q=accountant'))).not.toContain('Accountant — Mock 1');
      // And the Kenya detail page does not resolve through Rwanda.
      expect((await request(app).get('/api/countries/RW/mock-tests/accountant-mock-1')).status).toBe(404);
    } finally {
      await prisma.country.update({ where: { code: 'KE' }, data: { status: 'PREPARING' } });
    }
  });

  it('a signed-in user can only browse their own country', async () => {
    const { agent } = await signedInAgent(app, mail, 'cat.one@example.com');
    expect((await agent.get('/api/countries/RW/mock-tests')).status).toBe(200);
    await prisma.country.update({ where: { code: 'KE' }, data: { status: 'LIVE' } });
    try {
      const res = await agent.get('/api/countries/KE/mock-tests');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('country_mismatch');
      // A guest may look at any live country.
      expect((await request(app).get('/api/countries/KE/mock-tests')).status).toBe(200);
    } finally {
      await prisma.country.update({ where: { code: 'KE' }, data: { status: 'PREPARING' } });
    }
  });
});

describe('landing', () => {
  it('returns the seven categories with Teaching positions first and featured', async () => {
    const res = await request(app).get('/api/countries/RW/landing');
    expect(res.status).toBe(200);
    expect(res.body.categories.map((c: { slug: string }) => c.slug)).toEqual([
      'teaching-positions', 'school-leadership', 'government-administration',
      'accounting-finance', 'procurement', 'other-professional', 'licensing-exams',
    ]);
    expect(res.body.categories[0]).toMatchObject({ featured: true, mockTestCount: 4 });
    expect(res.body.featuredCategory.slug).toBe('teaching-positions');
    expect(res.body.country.disclaimer).toBe('Independent practice platform — not affiliated with MIFOTRA or REB.');
  });

  it('featured tests are teaching tests, free ones first; recently added is capped at four', async () => {
    const res = await request(app).get('/api/countries/RW/landing');
    expect(res.body.featuredTests).toHaveLength(4);
    for (const t of res.body.featuredTests) expect(t.category.slug).toBe('teaching-positions');
    expect(res.body.featuredTests[0].isFree).toBe(true);
    expect(res.body.recentlyAdded).toHaveLength(4);
  });

  it('suggests active jobs from the live catalog, and the price summary comes from the database', async () => {
    const res = await request(app).get('/api/countries/RW/landing');
    expect(res.body.popularSearches.length).toBeGreaterThan(0);
    expect(res.body.popularSearches.length).toBeLessThanOrEqual(5);
    expect(res.body.plan).toMatchObject({ priceLabel: 'RWF 2,000', durationDays: 30, autoRenew: false, checkoutAvailable: true });
  });

  it('does not count or show draft tests', async () => {
    const t = await prisma.mockTest.findFirstOrThrow({ where: { slug: 'procurement-officer-mock-1' } });
    await prisma.mockTest.update({ where: { id: t.id }, data: { status: 'DRAFT' } });
    try {
      const res = await request(app).get('/api/countries/RW/landing');
      const proc = res.body.categories.find((c: { slug: string }) => c.slug === 'procurement');
      expect(proc.mockTestCount).toBe(1);
    } finally {
      await prisma.mockTest.update({ where: { id: t.id }, data: { status: 'PUBLISHED' } });
    }
  });
});

describe('catalog search and filters', () => {
  it('lists every published Rwanda test with the card fields from the design', async () => {
    const body = await list();
    expect(body.total).toBe(12);
    const maths = body.results.find((r: Card) => r.slug === 'secondary-mathematics-teacher-s1-s3-mock-1');
    expect(maths).toMatchObject({
      title: 'Secondary Mathematics Teacher (S1–S3) — Mock 1', category: { name: 'Teaching positions' },
      questionCount: 20, durationMinutes: 30, languages: ['en'], difficulty: 'STANDARD',
      isFree: true, accessTag: 'FREE', attempts: 'UNLIMITED',
    });
    const acct = body.results.find((r: Card) => r.slug === 'accountant-public-institution-mock-1');
    expect(acct).toMatchObject({ accessTag: 'FULL_ACCESS', isFree: false, questionCount: 12 });
  });

  it('never leaks questions, options, answers or explanations', async () => {
    const body = JSON.stringify([await list(), (await request(app).get('/api/countries/RW/landing')).body]);
    expect(body).not.toMatch(/explanation|"payload"|"correct"|"options"|x = 3 or x/);
  });

  it('filters by category chip', async () => {
    const body = await list('?category=teaching-positions');
    expect(body.total).toBe(4);
    for (const r of body.results) expect(r.category.slug).toBe('teaching-positions');
    expect((await list('?category=procurement')).total).toBe(2);
  });

  it('filters by price: free only and Full Access only', async () => {
    const free = await list('?price=free');
    const paid = await list('?price=paid');
    expect(free.total + paid.total).toBe(12);
    expect(free.results.every((r: Card) => r.isFree)).toBe(true);
    expect(paid.results.every((r: Card) => !r.isFree)).toBe(true);
    expect(paid.total).toBe(5);
  });

  it('searches job title, case-insensitively', async () => {
    expect(titles(await list('?q=accountant')).sort()).toEqual([
      'Accountant (Public Institution) — Mock 1', 'Accountant — Free Sample',
    ]);
    expect((await list('?q=ACCOUNTANT')).total).toBe(2);
  });

  it('searches by category name and by subject (topic)', async () => {
    expect((await list('?q=procurement')).total).toBe(2);
    // "Geometry" is a topic inside the S1–S3 maths test only
    expect(titles(await list('?q=geometry'))).toEqual(['Secondary Mathematics Teacher (S1–S3) — Mock 1']);
  });

  it('requires every word to match (AND), so extra words narrow the results', async () => {
    const two = await list('?q=secondary+mathematics');
    expect(two.total).toBe(2);
    expect((await list('?q=secondary+mathematics+s4')).total).toBe(1);
    expect((await list('?q=secondary+accountant')).total).toBe(0);
  });

  it('treats search text literally (no wildcard or injection effect)', async () => {
    expect((await list('?q=%25')).total).toBe(0);
    const res = await request(app).get('/api/countries/RW/mock-tests').query({ q: "'; DROP TABLE \"MockTest\"; --" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect((await list()).total).toBe(12);
  });

  it('returns an empty state that can request the exam when a search has no results', async () => {
    const body = await list('?q=veterinary+officer');
    expect(body).toMatchObject({ total: 0, results: [], empty: true, canRequestExam: true });
    // An empty filter-only result is not a missing-exam case.
    const none = await list('?language=rw');
    expect(none).toMatchObject({ total: 0, empty: true, canRequestExam: false });
  });

  it('filters by difficulty, language and subject', async () => {
    const challenging = await list('?difficulty=CHALLENGING');
    expect(titles(challenging)).toEqual(['Secondary Mathematics Teacher (S4–S6) — Mock 1']);
    expect((await list('?language=en')).total).toBe(12);
    const subject = await list('?subject=public-procurement');
    expect(subject.total).toBe(2);
  });

  it('combines filters', async () => {
    const body = await list('?category=teaching-positions&price=free&q=primary');
    expect(titles(body)).toEqual(['Primary Teacher — General (P1–P6) Mock 1']);
  });

  it('exposes facets for the filter UI, scoped to Rwanda', async () => {
    const { facets } = await list();
    expect(facets.categories).toHaveLength(7);
    expect(facets.difficulties.sort()).toEqual(['CHALLENGING', 'FOUNDATION', 'STANDARD']);
    expect(facets.languages).toEqual(['en']);
    const subjectSlugs = facets.subjects.map((s: { slug: string }) => s.slug);
    expect(subjectSlugs).toContain('geometry-and-measurement');
    expect(facets.subjects.map((s: { name: string }) => s.name)).not.toContain('Pedagogy'); // Kenya-only topic
  });

  it('paginates and sorts', async () => {
    const p1 = await list('?pageSize=5&page=1&sort=title');
    const p3 = await list('?pageSize=5&page=3&sort=title');
    expect(p1.results).toHaveLength(5);
    expect(p3.results).toHaveLength(2);
    expect(p1.total).toBe(12);
    const sorted = titles(await list('?sort=title&pageSize=50'));
    // Postgres orders by byte value, so compare against a plain code-unit sort.
    expect(sorted).toEqual([...sorted].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it('rejects invalid parameters with a 400', async () => {
    for (const qs of ['?price=cheap', '?difficulty=EASY', '?page=0', '?pageSize=500', '?sort=random']) {
      const res = await request(app).get(`/api/countries/RW/mock-tests${qs}`);
      expect(res.status, qs).toBe(400);
      expect(res.body.error).toBe('validation_error');
    }
  });

  it('hides draft and archived tests', async () => {
    const t = await prisma.mockTest.findFirstOrThrow({ where: { slug: 'ict-officer-free-sample' } });
    await prisma.mockTest.update({ where: { id: t.id }, data: { status: 'ARCHIVED' } });
    try {
      expect((await list()).total).toBe(11);
      expect((await request(app).get('/api/countries/RW/mock-tests/ict-officer-free-sample')).status).toBe(404);
    } finally {
      await prisma.mockTest.update({ where: { id: t.id }, data: { status: 'PUBLISHED' } });
    }
  });

  it('only counts published questions', async () => {
    const q = await prisma.question.findFirstOrThrow({ where: { mockTest: { slug: 'ict-officer-free-sample' } } });
    await prisma.question.update({ where: { id: q.id }, data: { status: 'DRAFT' } });
    try {
      const body = await list('?q=ict');
      expect(body.results[0].questionCount).toBe(2);
    } finally {
      await prisma.question.update({ where: { id: q.id }, data: { status: 'PUBLISHED' } });
    }
  });
});

describe('request this exam', () => {
  it('records the request and normalises the email', async () => {
    const res = await request(app).post('/api/countries/RW/exam-requests').send({ query: 'Veterinary officer', email: ' Vet.Seeker@Example.com ' });
    expect(res.status).toBe(201);
    const row = await prisma.examRequest.findFirstOrThrow({ where: { query: 'Veterinary officer' } });
    expect(row).toMatchObject({ countryCode: 'RW', email: 'vet.seeker@example.com' });
  });

  it('validates input and is not available for hidden countries', async () => {
    expect((await request(app).post('/api/countries/RW/exam-requests').send({ query: 'x' })).status).toBe(400);
    expect((await request(app).post('/api/countries/RW/exam-requests').send({ query: 'Nurse', email: 'not-an-email' })).status).toBe(400);
    expect((await request(app).post('/api/countries/KE/exam-requests').send({ query: 'Nurse' })).status).toBe(404);
  });

  it('attaches the signed-in user’s email when none is given', async () => {
    const { agent } = await signedInAgent(app, mail, 'cat.two@example.com');
    await agent.post('/api/countries/RW/exam-requests').send({ query: 'Radiographer' });
    expect((await prisma.examRequest.findFirstOrThrow({ where: { query: 'Radiographer' } })).email).toBe('cat.two@example.com');
  });
});

describe('exam details', () => {
  const get = (slug: string, agent: { get: (p: string) => request.Test } = request(app)) =>
    agent.get(`/api/countries/RW/mock-tests/${slug}`);

  it('free test: facts, section table from real questions, instructions and the no-pass-mark note', async () => {
    const res = await get('secondary-mathematics-teacher-s1-s3-mock-1');
    expect(res.status).toBe(200);
    const b = res.body;
    expect(b).toMatchObject({
      title: 'Secondary Mathematics Teacher (S1–S3) — Mock 1', category: { name: 'Teaching positions' },
      questionCount: 20, durationMinutes: 30, totalMarks: 21, languages: ['en'], isFree: true,
    });
    expect(b.sections).toEqual([
      { name: 'Algebra & functions', questionType: 'Multiple choice', questions: 7, marks: 8 },
      { name: 'Geometry & measurement', questionType: 'Multiple choice', questions: 5, marks: 5 },
      { name: 'Statistics & probability', questionType: 'Multiple choice', questions: 4, marks: 4 },
      { name: 'Pedagogy & CBC', questionType: 'Multiple choice', questions: 4, marks: 4 },
    ]);
    expect(b.sections.reduce((n: number, s: { questions: number }) => n + s.questions, 0)).toBe(b.questionCount);
    expect(b.instructions.length).toBeGreaterThan(3);
    expect(b.passMark).toBeNull();
    expect(b.noOfficialPassMark).toBe(true);
    expect(b.negativeMarking).toBeNull();
  });

  it('free test is startable by a guest with no payment or account', async () => {
    const b = (await get('secondary-mathematics-teacher-s1-s3-mock-1')).body;
    expect(b.access).toMatchObject({ state: 'FREE', canStart: true, requiresAccount: false, needsFullAccess: false });
    expect(b.pricing).toBeNull();
    expect(b.freeSample).toBeNull();
  });

  it('paid test for a guest: locked, price from the database, free sample of the same profession offered', async () => {
    const b = (await get('accountant-public-institution-mock-1')).body;
    expect(b.access).toMatchObject({ state: 'LOCKED', canStart: false, needsFullAccess: true });
    expect(b.pricing).toMatchObject({ priceLabel: 'RWF 2,000', durationDays: 30, checkoutAvailable: true, paymentMethods: ['MTN MoMo', 'Airtel Money'] });
    expect(b.freeSample).toMatchObject({ slug: 'accountant-free-sample', title: 'Accountant — Free Sample', questionCount: 6 });
    expect(b.sections.find((s: { name: string }) => s.name.startsWith('Case study'))).toMatchObject({
      questionType: 'Case-based, 5 linked questions', questions: 5, marks: 12.5,
    });
  });

  it('falls back to any free test in the category when the profession has no free sample', async () => {
    const b = (await get('teaching-profession-cbc-pedagogy')).body;
    expect(b.access.state).toBe('LOCKED');
    expect(b.freeSample).not.toBeNull();
    const sample = await prisma.mockTest.findFirstOrThrow({ where: { slug: b.freeSample.slug } });
    expect(sample.isFree).toBe(true);
    expect(sample.countryCode).toBe('RW');
  });

  it('a signed-in user without a grant is locked; with an active Rwanda grant the paid test unlocks', async () => {
    const { agent, userId } = await signedInAgent(app, mail, 'cat.three@example.com');
    expect((await get('accountant-public-institution-mock-1', agent)).body.access.state).toBe('LOCKED');

    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW', code: 'FULL_ACCESS' } });
    await prisma.accessGrant.create({
      data: { userId, countryCode: 'RW', planId: plan.id, startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 22.5 * 86_400_000), source: 'MANUAL', reason: 'test' },
    });
    const b = (await get('accountant-public-institution-mock-1', agent)).body;
    expect(b.access).toMatchObject({ state: 'GRANTED', canStart: true, needsFullAccess: false, daysLeft: 23 });
    expect(b.pricing).toBeNull();
  });

  it('an expired or suspended grant does not unlock', async () => {
    const { agent, userId } = await signedInAgent(app, mail, 'cat.four@example.com');
    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW', code: 'FULL_ACCESS' } });
    await prisma.accessGrant.create({
      data: { userId, countryCode: 'RW', planId: plan.id, startsAt: new Date(Date.now() - 40 * 86_400_000), endsAt: new Date(Date.now() - 86_400_000), source: 'MANUAL', reason: 'old' },
    });
    await prisma.accessGrant.create({
      data: { userId, countryCode: 'RW', planId: plan.id, startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 5 * 86_400_000), source: 'MANUAL', reason: 'paused', status: 'SUSPENDED' },
    });
    expect((await get('accountant-public-institution-mock-1', agent)).body.access.state).toBe('LOCKED');
  });

  it('lists a signed-in user’s previous attempts with score and time used', async () => {
    const { agent, userId } = await signedInAgent(app, mail, 'cat.five@example.com');
    const test = await prisma.mockTest.findFirstOrThrow({ where: { slug: 'secondary-mathematics-teacher-s1-s3-mock-1' } });
    const started = new Date(Date.now() - 3 * 86_400_000);
    await prisma.attempt.create({
      data: {
        mockTestId: test.id, countryCode: 'RW', userId, status: 'SUBMITTED', durationSeconds: 1800, startedAt: started,
        deadlineAt: new Date(started.getTime() + 1_800_000), submittedAt: new Date(started.getTime() + 54 * 60_000),
        scoreMarks: 13.64, totalMarks: 22, percent: 62,
      },
    });
    await prisma.attempt.create({
      data: { mockTestId: test.id, countryCode: 'RW', userId, status: 'IN_PROGRESS', durationSeconds: 1800, deadlineAt: new Date(Date.now() + 600_000) },
    });
    const b = (await get('secondary-mathematics-teacher-s1-s3-mock-1', agent)).body;
    expect(b.previousAttempts).toHaveLength(1); // the unfinished one is a resume prompt, not history
    expect(b.previousAttempts[0]).toMatchObject({ percent: 62, scoreMarks: 13.64, totalMarks: 22, minutesUsed: 54 });
    // A guest never sees anyone's attempts.
    expect((await get('secondary-mathematics-teacher-s1-s3-mock-1')).body.previousAttempts).toEqual([]);
  });

  it('shows an official pass mark only when it has a source — never otherwise', async () => {
    const t = await prisma.mockTest.findFirstOrThrow({ where: { slug: 'headteacher-school-leadership-mock-1' } });
    try {
      await prisma.mockTest.update({ where: { id: t.id }, data: { passMarkPercent: 50 } }); // no source
      let b = (await get('headteacher-school-leadership-mock-1')).body;
      expect(b.passMark).toBeNull();
      expect(b.noOfficialPassMark).toBe(true);

      await prisma.mockTest.update({ where: { id: t.id }, data: { passMarkSource: 'Ministry circular 12/2026' } });
      b = (await get('headteacher-school-leadership-mock-1')).body;
      expect(b.passMark).toEqual({ percent: 50, source: 'Ministry circular 12/2026' });
      expect(b.noOfficialPassMark).toBe(false);
    } finally {
      await prisma.mockTest.update({ where: { id: t.id }, data: { passMarkPercent: null, passMarkSource: null } });
    }
  });

  it('reports negative marking only when configured', async () => {
    const t = await prisma.mockTest.findFirstOrThrow({ where: { slug: 'procurement-officer-free-sample' } });
    try {
      await prisma.mockTest.update({ where: { id: t.id }, data: { negativeMarkPerWrong: 0.25 } });
      expect((await get('procurement-officer-free-sample')).body.negativeMarking).toEqual({ perWrongAnswer: 0.25 });
    } finally {
      await prisma.mockTest.update({ where: { id: t.id }, data: { negativeMarkPerWrong: 0 } });
    }
  });

  it('shows no price when a country has not set one, and no checkout', async () => {
    await prisma.planConfig.updateMany({ where: { countryCode: 'RW', code: 'FULL_ACCESS' }, data: { priceMinor: null } });
    try {
      const b = (await get('accountant-public-institution-mock-1')).body;
      expect(b.pricing).toMatchObject({ priceLabel: null, checkoutAvailable: false });
    } finally {
      await prisma.planConfig.updateMany({ where: { countryCode: 'RW', code: 'FULL_ACCESS' }, data: { priceMinor: 2000 } });
    }
  });

  it('404s for unknown slugs', async () => {
    expect((await get('does-not-exist')).body.error).toBe('mock_test_not_found');
  });
});

describe('pricing page', () => {
  it('Free samples at RWF 0 and Full Access paid once for 30 days, with Mobile Money methods', async () => {
    const b = (await request(app).get('/api/countries/RW/pricing')).body;
    expect(b.free).toEqual({ priceLabel: 'RWF 0', mockTestCount: 7 });
    expect(b.fullAccess).toMatchObject({
      priceLabel: 'RWF 2,000', priceMinor: 2000, durationDays: 30, paidOnce: true, autoRenew: false, mockTestCount: 12, checkoutAvailable: true,
    });
    expect(b.paymentMethods.map((m: { label: string }) => m.label)).toEqual(['MTN MoMo', 'Airtel Money']);
  });
});
