import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { scoreAttempt, type QuestionPayload } from '../../src/domain/scoring';
import { resetAndSeed, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const app = createApp({ prisma, config: testConfig() });

beforeAll(() => resetAndSeed(prisma));
afterAll(() => prisma.$disconnect());

describe('GET /api/health', () => {
  it('reports the database as up', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });
});

describe('country config (price and currency come from the database)', () => {
  it('Rwanda is live with RWF 2,000 for 30 days, MTN MoMo and Airtel Money', async () => {
    const res = await request(app).get('/api/countries/rw');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('LIVE');
    expect(res.body.languages).toEqual(['en', 'rw']);
    expect(res.body.plan).toMatchObject({
      priceMinor: 2000, priceLabel: 'RWF 2,000', durationDays: 30, autoRenew: false, checkoutAvailable: true,
    });
    expect(res.body.paymentMethods.map((m: { provider: string }) => m.provider)).toEqual(['MTN_MOMO', 'AIRTEL_MONEY']);
    expect(res.body.disclaimer).toBe('Independent practice platform — not affiliated with MIFOTRA or REB.');
  });

  it('Kenya is preparing: price unset, no checkout, M-Pesa sandbox only', async () => {
    const res = await request(app).get('/api/countries/KE');
    expect(res.body.status).toBe('PREPARING');
    expect(res.body.plan).toMatchObject({ priceMinor: null, priceLabel: null, currencyCode: 'KES', checkoutAvailable: false });
    expect(res.body.paymentMethods).toEqual([
      expect.objectContaining({ provider: 'MPESA', mode: 'SANDBOX' }),
    ]);
  });

  it('only live countries are selectable; Uganda and Tanzania are planned', async () => {
    const res = await request(app).get('/api/countries');
    const by = Object.fromEntries(res.body.countries.map((c: { code: string }) => [c.code, c]));
    expect(by.RW.selectable).toBe(true);
    expect([by.KE.selectable, by.UG.selectable, by.TZ.selectable]).toEqual([false, false, false]);
    expect([by.UG.status, by.TZ.status]).toEqual(['PLANNED', 'PLANNED']);
  });

  it('404s for unknown countries and unknown API paths', async () => {
    expect((await request(app).get('/api/countries/xx')).status).toBe(404);
    expect((await request(app).get('/api/nope')).status).toBe(404);
  });
});

describe('seed data invariants (business rules)', () => {
  it('every Rwanda category has at least one published free sample test', async () => {
    const cats = await prisma.category.findMany({
      where: { countryCode: 'RW' },
      include: { mockTests: { where: { status: 'PUBLISHED', isFree: true } } },
    });
    expect(cats).toHaveLength(6);
    for (const c of cats) expect(c.mockTests.length, `${c.name} needs a free sample`).toBeGreaterThan(0);
  });

  it('never invents a pass mark', async () => {
    const withPass = await prisma.mockTest.count({ where: { OR: [{ passMarkPercent: { not: null } }, { passMarkSource: { not: null } }] } });
    expect(withPass).toBe(0);
  });

  it('negative marking is off everywhere unless configured', async () => {
    expect(await prisma.mockTest.count({ where: { negativeMarkPerWrong: { not: 0 } } })).toBe(0);
  });

  it('every question belongs to a test of the same country as its topic’s category', async () => {
    const qs = await prisma.question.findMany({
      include: { mockTest: true, topic: { include: { category: true } } },
    });
    expect(qs.length).toBeGreaterThan(50);
    for (const q of qs) expect(q.topic.category.countryCode).toBe(q.mockTest.countryCode);
  });

  it('every question has valid options, a correct key that exists, and an explanation', async () => {
    const qs = await prisma.question.findMany();
    for (const q of qs) {
      const p = q.payload as unknown as QuestionPayload;
      const keys = p.options.map((o) => o.key);
      expect(p.options.length).toBeGreaterThanOrEqual(2);
      expect(new Set(keys).size).toBe(keys.length);
      expect(p.correct.length).toBeGreaterThan(0);
      for (const k of p.correct) expect(keys).toContain(k);
      if (q.type !== 'MULTIPLE_SELECT') expect(p.correct).toHaveLength(1);
      expect(q.explanation.length, `explanation for ${q.stem}`).toBeGreaterThan(10);
    }
  });

  it('case-based questions are linked to a case and only those are', async () => {
    const qs = await prisma.question.findMany();
    for (const q of qs) expect(q.type === 'CASE_BASED').toBe(q.caseId !== null);
    const accountant = await prisma.mockTest.findFirstOrThrow({
      where: { slug: 'accountant-public-institution-mock-1' },
      include: { cases: true, questions: true },
    });
    expect(accountant.cases).toHaveLength(1);
    expect(accountant.questions.filter((q) => q.caseId).length).toBe(5);
  });

  it('declared total marks equal the sum of question marks', async () => {
    const tests = await prisma.mockTest.findMany({ include: { questions: true } });
    for (const t of tests) {
      const sum = t.questions.reduce((s, q) => s + Number(q.marks), 0);
      expect(Number(t.totalMarks), t.slug).toBeCloseTo(sum, 2);
    }
  });

  it('seeds a multiple-select question with partial credit that scores correctly', async () => {
    const q = await prisma.question.findFirstOrThrow({
      where: { type: 'MULTIPLE_SELECT' },
      include: { topic: true },
    });
    const scorable = {
      id: q.id, type: q.type, payload: q.payload as unknown as QuestionPayload,
      marks: Number(q.marks), topicId: q.topicId, topicName: q.topic.name,
    };
    expect((q.payload as unknown as QuestionPayload).scoring).toBe('PARTIAL');
    expect(scoreAttempt([scorable], { [q.id]: ['A'] }).scoreMarks).toBe(1);
    expect(scoreAttempt([scorable], { [q.id]: ['A', 'C'] }).scoreMarks).toBe(2);
  });

  it('the Accountant case-study answers add up (cash surplus 167m, accrual surplus 214m)', async () => {
    const qs = await prisma.question.findMany({
      where: { mockTest: { slug: 'accountant-public-institution-mock-1' }, type: 'CASE_BASED' },
      orderBy: { sortOrder: 'asc' },
    });
    const correctText = qs.map((q) => {
      const p = q.payload as unknown as QuestionPayload;
      return p.options.find((o) => o.key === p.correct[0])!.text;
    });
    expect(correctText).toEqual([
      'RWF 316,000,000', 'RWF 70,000,000', 'RWF 12,000,000', 'RWF 167,000,000', 'RWF 214,000,000',
    ]);
  });

  it('Kenya has its own tests, none visible through Rwanda’s catalogue', async () => {
    const ke = await prisma.mockTest.count({ where: { countryCode: 'KE' } });
    const rwWithKeCategory = await prisma.mockTest.count({
      where: { countryCode: 'RW', category: { countryCode: 'KE' } },
    });
    expect(ke).toBeGreaterThan(0);
    expect(rwWithKeCategory).toBe(0);
  });

  it('admin roles: only system admin may manage admins and grant access manually', async () => {
    const roles = await prisma.role.findMany();
    const by = Object.fromEntries(roles.map((r) => [r.name, r.permissions]));
    expect(by.SYSTEM_ADMIN).toContain('payments:grant');
    expect(by.CONTENT_EDITOR).not.toContain('payments:grant');
    expect(by.CONTENT_EDITOR).not.toContain('users:manage');
    expect(by.SUPPORT).not.toContain('exams:write');
    expect(by.SUPPORT).toContain('otp:resend');
    // admins are ordinary accounts (Rwanda) holding role assignments; one account may hold several
    const holders = await prisma.user.findMany({ where: { roles: { some: {} } }, include: { roles: { include: { role: true } } }, orderBy: { email: 'asc' } });
    expect(holders.map((u) => [u.email, u.countryCode, u.roles.map((r) => [r.role.name, r.countryScope, r.active]).sort()])).toEqual([
      ['content.editor@jobprep.test', 'RW', [['CONTENT_EDITOR', ['RW'], true]]],
      ['multi.role@jobprep.test', 'RW', [['CONTENT_EDITOR', ['RW'], true], ['SUPPORT', [], true]]],
      ['support@jobprep.test', 'RW', [['SUPPORT', [], true]]],
      ['system.admin@jobprep.test', 'RW', [['SYSTEM_ADMIN', [], true]]],
    ]);
  });

  it('seeding twice is refused instead of duplicating data', async () => {
    await expect(resetAndSeedAgainWithoutTruncate()).rejects.toThrow(/already seeded/);
  });
});

async function resetAndSeedAgainWithoutTruncate() {
  const { seedDatabase } = await import('../../prisma/seed-lib');
  return seedDatabase(prisma);
}

describe('database constraints that protect money and access', () => {
  it('a payment can have at most one access grant (duplicate callbacks cannot double-grant)', async () => {
    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW', code: 'FULL_ACCESS' } });
    const user = await prisma.user.create({ data: { countryCode: 'RW', email: 'constraint.user@example.com', name: 'T' } });
    const payment = await prisma.payment.create({
      data: {
        userId: user.id, countryCode: 'RW', planId: plan.id, provider: 'MTN_MOMO', msisdn: '+250788111222',
        amountMinor: 2000, currencyCode: 'RWF', idempotencyKey: 'k-1', expiresAt: new Date(Date.now() + 180_000),
      },
    });
    const grant = {
      userId: user.id, countryCode: 'RW', planId: plan.id, paymentId: payment.id,
      startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 86_400_000),
    };
    await prisma.accessGrant.create({ data: grant });
    await expect(prisma.accessGrant.create({ data: grant })).rejects.toThrow(/Unique constraint/);
  });

  it('payment events dedupe on their key (duplicate webhook is a no-op at the DB level)', async () => {
    const payment = await prisma.payment.findFirstOrThrow();
    const ev = { paymentId: payment.id, source: 'webhook', status: 'SUCCESSFUL', dedupeKey: 'evt-1', payload: {} };
    await prisma.paymentEvent.create({ data: ev });
    await expect(prisma.paymentEvent.create({ data: ev })).rejects.toThrow(/Unique constraint/);
  });

  it('one answer row per attempt and question', async () => {
    const test = await prisma.mockTest.findFirstOrThrow({ where: { slug: 'secondary-mathematics-teacher-s1-s3-mock-1' }, include: { questions: true } });
    const attempt = await prisma.attempt.create({
      data: { mockTestId: test.id, countryCode: 'RW', guestToken: 'g-1', durationSeconds: 1800, deadlineAt: new Date(Date.now() + 1_800_000) },
    });
    const row = { attemptId: attempt.id, questionId: test.questions[0]!.id, selected: ['A'] };
    await prisma.attemptAnswer.create({ data: row });
    await expect(prisma.attemptAnswer.create({ data: row })).rejects.toThrow(/Unique constraint/);
  });
});
