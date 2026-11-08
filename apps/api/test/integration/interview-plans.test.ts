import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { quoteInterview } from '../../src/domain/plans';
import { createProviderRegistry } from '../../src/payments/registry';
import { ConsoleEmailProvider } from '../../src/services/email';
import { debitSeconds, ensureTrial, getWallet } from '../../src/interview/wallet';
import { resetAndSeed, signedInAgent, testConfig, testPrisma } from '../helpers';

/** Full Access (seeded at RWF 2,000) and Full Access + Interview prep (RWF 3,000, 300 minutes). */
const prisma = testPrisma();
const mail = new ConsoleEmailProvider(() => {});
const on = testConfig({ INTERVIEW_PREP_ENABLED: 'true' });
const off = testConfig();
const providers = createProviderRegistry(on);
let clock = new Date('2026-11-02T10:00:00Z');
const app = createApp({ prisma, config: on, email: mail, providers, now: () => clock });
const appOff = createApp({ prisma, config: off, email: mail, providers: createProviderRegistry(off), now: () => clock });
const DAY = 86_400_000;
const advanceDays = (d: number) => { clock = new Date(clock.getTime() + d * DAY); };

let seq = 700000;
type Agent = ReturnType<typeof request.agent>;
const newUser = async () => signedInAgent(app, mail, `tier${seq++}@example.com`);
const pay = (agent: Agent, body: object = {}) => agent.post('/api/payments').send({ provider: 'MTN_MOMO', msisdn: '078 811 2233', ...body });
const succeed = (id: string) => request(app).post(`/api/test/payments/${id}/simulate`).send({ outcome: 'success', deliver: true });
const grantsFor = (userId: string) => prisma.accessGrant.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
const bucketsFor = (userId: string) => prisma.minuteBucket.findMany({ where: { userId, source: 'PURCHASE' } });

async function buy(agent: Agent, body: object) {
  const res = await pay(agent, body);
  expect(res.status).toBe(201);
  expect((await succeed(res.body.id)).status).toBe(200);
  return res.body;
}

beforeAll(() => resetAndSeed(prisma));
beforeEach(() => { clock = new Date('2026-11-02T10:00:00Z'); mail.clear(); });
afterAll(() => prisma.$disconnect());

describe('quoteInterview', () => {
  const now = new Date('2026-11-02T00:00:00Z');
  const base = { interviewPriceMinor: 3000, fullAccessPriceMinor: 950, durationDays: 30, hasPurchasedMinutes: false, now };
  it('no access: only the full price, for a fresh 30 days', () => {
    const q = quoteInterview({ ...base, coveredUntil: null });
    expect(q.upgrade).toBeNull();
    expect(q.full).toMatchObject({ amountMinor: 3000, minutesExpireAt: new Date('2026-12-02T00:00:00Z') });
    expect(q.showFull).toBe(true);
  });
  it('active Full Access: the difference (2,050), minutes until the current end; the full price too when < 7 days are left', () => {
    const q = quoteInterview({ ...base, coveredUntil: new Date('2026-11-20T00:00:00Z') });
    expect(q.upgrade).toEqual({ amountMinor: 2050, minutesExpireAt: new Date('2026-11-20T00:00:00Z') });
    expect(q.showFull).toBe(false);
    expect(quoteInterview({ ...base, coveredUntil: new Date('2026-11-06T00:00:00Z') }).showFull).toBe(true);
  });
  it('no upgrade once interview minutes were bought for this period', () => {
    expect(quoteInterview({ ...base, coveredUntil: new Date('2026-11-20T00:00:00Z'), hasPurchasedMinutes: true }).upgrade).toBeNull();
  });
});

describe('the interview tier at checkout', () => {
  it('is hidden and cannot be bought while interview prep is switched off', async () => {
    expect((await request(appOff).get('/api/countries/rw/pricing')).body.interviewPrep).toBeNull();
    const { agent } = await signedInAgent(appOff, mail, `tier${seq++}@example.com`);
    expect((await agent.get('/api/me/checkout?plan=interview')).body.plan).toBeNull();
    expect((await agent.post('/api/payments').send({ provider: 'MTN_MOMO', msisdn: '0788112233', plan: 'interview' })).body.error).toBe('checkout_unavailable');
  });

  it('pricing shows both tiers and the upgrade price', async () => {
    const b = (await request(app).get('/api/countries/rw/pricing')).body;
    expect(b.fullAccess).toMatchObject({ priceLabel: 'RWF 2,000' });
    expect(b.interviewPrep).toMatchObject({ name: 'Full Access + Interview prep', priceLabel: 'RWF 3,000', interviewMinutes: 300, durationDays: 30, upgradePriceLabel: 'RWF 1,000' });
  });

  it('a new buyer pays 3,000 and gets 30 days of mock access plus 300 minutes that expire with it', async () => {
    const { agent, userId } = await newUser();
    const summary = (await agent.get('/api/me/checkout?plan=interview')).body;
    expect(summary.plan).toMatchObject({ code: 'interview', priceLabel: 'RWF 3,000', kind: 'PURCHASE', interviewMinutes: 300, checkoutAvailable: true });
    expect(summary.interviewOptions).toMatchObject({ upgrade: null, showFull: true, selected: 'new' });

    const p = await buy(agent, { plan: 'interview' });
    expect(p.amountMinor).toBe(3000);
    const [grant] = await grantsFor(userId);
    expect(grant!.endsAt.getTime() - grant!.startsAt.getTime()).toBe(30 * DAY);
    const [bucket] = await bucketsFor(userId);
    expect(bucket).toMatchObject({ seconds: 300 * 60, remainingSeconds: 300 * 60, accessGrantId: grant!.id });
    expect(bucket!.expiresAt).toEqual(grant!.endsAt);
    expect(mail.sent.at(-1)!.text).toContain('Full Access + Interview prep is active until');
    expect(mail.sent.at(-1)!.text).toContain('300 AI interview minutes');
    // It unlocks the paid mock tests like Full Access does.
    expect((await agent.get('/api/countries/rw/mock-tests/accountant-public-institution-mock-1')).body.access.state).toBe('GRANTED');
    // Bought for this period already: buying again is the full price (a new 30 days), never an upgrade.
    expect((await agent.get('/api/me/checkout?plan=interview')).body.interviewOptions.upgrade).toBeNull();
  });

  it('Full Access holders upgrade for the difference: minutes until their current end date, no extra mock days', async () => {
    const { agent, userId } = await newUser();
    await buy(agent, {}); // Full Access, RWF 2,000
    advanceDays(10);
    const summary = (await agent.get('/api/me/checkout?plan=interview')).body;
    expect(summary.plan).toMatchObject({ priceLabel: 'RWF 1,000', kind: 'UPGRADE' });
    expect(summary.interviewOptions).toMatchObject({ selected: 'upgrade', showFull: false, upgrade: { priceLabel: 'RWF 1,000' } });
    const [fa] = await grantsFor(userId);
    expect(new Date(summary.newAccessEndsAt)).toEqual(fa!.endsAt);

    const p = await buy(agent, { plan: 'interview' });
    expect(p.amountMinor).toBe(1000);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).kind).toBe('UPGRADE');
    const grants = await grantsFor(userId);
    expect(grants).toHaveLength(2);
    expect(grants[1]!.startsAt).toEqual(clock);
    expect(grants[1]!.endsAt).toEqual(fa!.endsAt); // coverage unchanged
    const [bucket] = await bucketsFor(userId);
    expect(bucket!.expiresAt).toEqual(fa!.endsAt);
    expect(bucket!.remainingSeconds).toBe(300 * 60);
  });

  it('near the end of access the full price is offered too, and `new` buys a fresh 30 days after the current end', async () => {
    const { agent, userId } = await newUser();
    await buy(agent, {});
    advanceDays(27);
    const summary = (await agent.get('/api/me/checkout?plan=interview')).body;
    expect(summary.interviewOptions).toMatchObject({ selected: 'upgrade', showFull: true, full: { priceLabel: 'RWF 3,000' } });
    expect((await agent.get('/api/me/checkout?plan=interview&option=new')).body.plan).toMatchObject({ priceLabel: 'RWF 3,000', kind: 'PURCHASE' });

    const p = await buy(agent, { plan: 'interview', option: 'new' });
    expect(p.amountMinor).toBe(3000);
    const grants = await grantsFor(userId);
    expect(grants[1]!.startsAt).toEqual(grants[0]!.endsAt); // chained
    const [bucket] = await bucketsFor(userId);
    expect(bucket!.expiresAt).toEqual(grants[1]!.endsAt);
  });

  it('`upgrade` is refused when there is nothing to upgrade', async () => {
    const { agent } = await newUser();
    expect((await pay(agent, { plan: 'interview', option: 'upgrade' })).body.error).toBe('upgrade_unavailable');
  });

  it('a pending Full Access request is not reused for an interview purchase', async () => {
    const { agent } = await newUser();
    const a = await pay(agent, {});
    const b = await pay(agent, { plan: 'interview' });
    expect(b.status).toBe(201);
    expect(b.body.id).not.toBe(a.body.id);
    expect(b.body.amountMinor).toBe(3000);
  });
});

describe('minute wallet', () => {
  it('the trial is given once; time is spent from the soonest-expiring minutes first, the trial last', async () => {
    const { userId } = await newUser();
    await ensureTrial(prisma, userId, 5);
    await ensureTrial(prisma, userId, 5);
    expect(await prisma.minuteBucket.count({ where: { userId, source: 'TRIAL' } })).toBe(1);
    const grantA = await prisma.accessGrant.create({ data: { userId, countryCode: 'RW', planId: (await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW', code: 'FULL_ACCESS_INTERVIEW' } })).id, startsAt: clock, endsAt: new Date(clock.getTime() + 3 * DAY), source: 'MANUAL' } });
    await prisma.minuteBucket.create({ data: { userId, source: 'PURCHASE', key: `grant:${grantA.id}`, accessGrantId: grantA.id, seconds: 120, remainingSeconds: 120, expiresAt: grantA.endsAt } });

    let w = await getWallet(prisma, userId, clock);
    expect(w).toMatchObject({ remainingSeconds: 420, totalSeconds: 420, hasPurchased: true, trialUsed: false });

    const job = await prisma.interviewJob.create({ data: { userId, countryCode: 'RW', source: 'PASTE', title: 'QA', textEnc: 'v1:x', profile: {} } });
    const session = await prisma.interviewSession.create({ data: { userId, jobId: job.id, durationMinutes: 15, plan: {} } });
    const charged = await prisma.$transaction((tx) => debitSeconds(tx, userId, session.id, 150, clock));
    expect(charged).toBe(150);
    w = await getWallet(prisma, userId, clock);
    expect(w.remainingSeconds).toBe(270);
    expect(w.buckets.find((b) => b.source === 'PURCHASE')!.remainingSeconds).toBe(0); // spent first (expires first)
    expect(w.buckets.find((b) => b.source === 'TRIAL')!.remainingSeconds).toBe(270);
    expect(w.trialUsed).toBe(true);
    const debits = await prisma.minuteDebit.findMany({ where: { sessionId: session.id } });
    expect(debits.map((d) => d.seconds).sort()).toEqual([120, 30]);

    // More than is left: only the balance is charged; the audit rows grow in place.
    expect(await prisma.$transaction((tx) => debitSeconds(tx, userId, session.id, 1000, clock))).toBe(270);
    expect((await prisma.minuteDebit.findMany({ where: { sessionId: session.id } })).reduce((s, d) => s + d.seconds, 0)).toBe(420);

    // Expired minutes do not count.
    advanceDays(4);
    expect((await getWallet(prisma, userId, clock)).buckets.some((b) => b.source === 'PURCHASE')).toBe(false);
  });
});
