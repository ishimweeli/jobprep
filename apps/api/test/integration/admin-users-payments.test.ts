import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { createProviderRegistry } from '../../src/payments/registry';
import { ConsoleEmailProvider } from '../../src/services/email';
import { ADMINS, adminAgent, resetAndSeed, signedInAgent, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const mail = new ConsoleEmailProvider(() => {});
const config = testConfig();
const providers = createProviderRegistry(config);
// A real-time clock: users get their createdAt from the database, so "today" must be today.
let clock = new Date();
const app = createApp({ prisma, config, email: mail, providers, now: () => clock });
const advance = (secs: number) => { clock = new Date(clock.getTime() + secs * 1000); };
const DAY = 86_400_000;
const ACCOUNTANT = 'accountant-public-institution-mock-1';
const MATHS = 'secondary-mathematics-teacher-s1-s3-mock-1';

type Agent = ReturnType<typeof request.agent>;
let system: Agent; let support: Agent;
let seq = 900000;
const nextId = () => seq++;

beforeAll(async () => {
  await resetAndSeed(prisma);
  system = await adminAgent(app, mail, ADMINS.SYSTEM);
  support = await adminAgent(app, mail, ADMINS.SUPPORT);
});
afterAll(() => prisma.$disconnect());

async function candidate(name = 'Test Candidate') {
  const n = nextId();
  const email = `cand${n}@example.com`;
  const msisdn = `+250788${n}`;
  const c = await signedInAgent(app, mail, email);
  await prisma.user.update({ where: { id: c.userId }, data: { name } });
  return { ...c, email, msisdn, name };
}
async function grant(userId: string, startDays: number, endDays: number) {
  const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW' } });
  return prisma.accessGrant.create({
    data: { userId, countryCode: 'RW', planId: plan.id, source: 'MANUAL', reason: 'seed', startsAt: new Date(clock.getTime() + startDays * DAY), endsAt: new Date(clock.getTime() + endDays * DAY) },
  });
}
async function pay(c: Awaited<ReturnType<typeof candidate>>, provider = 'MTN_MOMO') {
  const res = await c.agent.post('/api/payments').send({ provider, msisdn: c.msisdn });
  expect(res.status).toBe(201);
  return res.body.id as string;
}
const simulate = (id: string, outcome: string, deliver = true) => request(app).post(`/api/test/payments/${id}/simulate`).send({ outcome, deliver });
const grantsOf = (userId: string) => prisma.accessGrant.findMany({ where: { userId }, orderBy: { startsAt: 'asc' } });

describe('users: list, filters and detail', () => {
  const tag = `Zq${Date.now() % 100000}`;
  const made: Record<string, Awaited<ReturnType<typeof candidate>>> = {};
  beforeAll(async () => {
    for (const k of ['Active', 'Free', 'Expired', 'Suspended']) made[k] = await candidate(`${tag} ${k}`);
    await grant(made.Active!.userId, -20, 10);
    await grant(made.Expired!.userId, -40, -5);
    await prisma.user.update({ where: { id: made.Suspended!.userId }, data: { status: 'SUSPENDED', suspendedReason: 'shared account' } });
    // one finished attempt for Active
    const start = await made.Active!.agent.post(`/api/countries/RW/mock-tests/${MATHS}/attempts`).send({});
    await made.Active!.agent.post(`/api/attempts/${start.body.attemptId}/submit`).send({});
  });

  const names = async (qs: string) => (await system.get(`/api/admin/users?q=${tag}&pageSize=50&${qs}`)).body.results.map((u: { name: string }) => u.name.replace(`${tag} `, '')).sort();

  it('each filter chip shows the right people', async () => {
    expect(await names('filter=all')).toEqual(['Active', 'Expired', 'Free', 'Suspended']);
    expect(await names('filter=active')).toEqual(['Active']);
    expect(await names('filter=free')).toEqual(['Free']);
    expect(await names('filter=expired')).toEqual(['Expired']);
    expect(await names('filter=suspended')).toEqual(['Suspended']);
  });

  it('rows carry access state, days left, tests taken and the goal', async () => {
    const rows = (await system.get(`/api/admin/users?q=${tag}&pageSize=50`)).body.results as { name: string; access: { state: string; daysLeft: number | null }; testsTaken: number }[];
    const by = (k: string) => rows.find((r) => r.name.endsWith(k))!;
    expect(by('Active')).toMatchObject({ testsTaken: 1, access: { state: 'active', daysLeft: 10 } });
    expect(by('Free').access.state).toBe('free');
    expect(by('Expired').access).toMatchObject({ state: 'expired', daysLeft: null });
    expect(by('Suspended').access.state).toBe('suspended');
  });

  it('searches by name and by email (case-insensitive), and paginates', async () => {
    expect((await system.get(`/api/admin/users?q=${tag}%20free`)).body.total).toBe(1);
    const email = made.Free!.email.toUpperCase();
    expect((await system.get(`/api/admin/users?q=${encodeURIComponent(email)}`)).body.results[0].id).toBe(made.Free!.userId);
    expect((await system.get('/api/admin/users?q=%40example.com')).body.total).toBeGreaterThan(0);
    const p2 = (await system.get(`/api/admin/users?q=${tag}&pageSize=3&page=2`)).body;
    expect([p2.total, p2.results.length, p2.page]).toEqual([4, 1, 2]);
    expect((await system.get('/api/admin/users?filter=bogus')).status).toBe(400);
  });

  it('detail: profile, access, attempts with attempt numbers, payments and admin history', async () => {
    const a = made.Active!;
    const start2 = await a.agent.post(`/api/countries/RW/mock-tests/${MATHS}/attempts`).send({});
    await a.agent.post(`/api/attempts/${start2.body.attemptId}/submit`).send({});
    const d = (await system.get(`/api/admin/users/${a.userId}`)).body;
    expect(d.user).toMatchObject({ name: `${tag} Active`, countryCode: 'RW', status: 'ACTIVE' });
    expect(d.access).toMatchObject({ state: 'active', daysLeft: 10, lastPaymentFailed: false, pendingPaymentSince: null });
    expect(d.attempts.map((x: { attemptNumber: number }) => x.attemptNumber).sort()).toEqual([1, 2]);
    expect(d.attempts[0].title).toBe('Secondary Mathematics Teacher (S1–S3) — Mock 1');
    expect(d.adminHistory).toEqual([]);
    expect((await system.get('/api/admin/users/does-not-exist')).body.error).toBe('user_not_found');
  });

  it('detail shows a pending payment and a failed last payment', async () => {
    const c = await candidate(`${tag} Pending`);
    await pay(c);
    const d = (await system.get(`/api/admin/users/${c.userId}`)).body;
    expect(d.access.pendingPaymentSince).not.toBeNull();
    expect(d.payments[0]).toMatchObject({ status: 'PENDING', providerLabel: 'MTN MoMo', priceLabel: 'RWF 2,000' });
    const f = await candidate(`${tag} Failed`);
    const id = await pay(f, 'AIRTEL_MONEY');
    await simulate(id, 'decline');
    expect((await system.get(`/api/admin/users/${f.userId}`)).body.access.lastPaymentFailed).toBe(true);
  });
});

describe('users: grant, suspend, login code (reason required, audited)', () => {
  it('granting access needs a real reason', async () => {
    const c = await candidate();
    for (const body of [{}, { reason: '' }, { reason: 'abc' }]) {
      const r = await system.post(`/api/admin/users/${c.userId}/access`).send(body);
      expect(r.status).toBe(400);
    }
    expect(await grantsOf(c.userId)).toHaveLength(0);
    expect((await system.post(`/api/admin/users/${c.userId}/access`).send({ reason: 'ok for 500 days', days: 500 })).status).toBe(400);
    expect((await system.post(`/api/admin/users/${c.userId}/access`).send({ reason: 'zero days', days: 0 })).status).toBe(400);
  });

  it('grants the plan length by default, records who and why, audits it, and unlocks paid tests', async () => {
    const c = await candidate('Olivier Kayitare');
    expect((await c.agent.post(`/api/countries/RW/mock-tests/${ACCOUNTANT}/attempts`).send({})).status).toBe(402);
    const res = await system.post(`/api/admin/users/${c.userId}/access`).send({ reason: 'MoMo SMS confirmed, callback missing' });
    expect(res.status).toBe(201);
    expect(res.body.access).toMatchObject({ state: 'active', daysLeft: 30 });
    const [g] = await grantsOf(c.userId);
    expect(g).toMatchObject({ source: 'MANUAL', reason: 'MoMo SMS confirmed, callback missing', countryCode: 'RW', status: 'ACTIVE' });
    expect(g!.grantedById).not.toBeNull();
    expect((await c.agent.post(`/api/countries/RW/mock-tests/${ACCOUNTANT}/attempts`).send({})).status).toBe(201);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'access.grant', entityId: c.userId }, include: { actor: true } });
    expect(log).toMatchObject({ reason: 'MoMo SMS confirmed, callback missing', countryCode: 'RW', entityType: 'user' });
    expect(log.actor?.name).toBe('Jean Bosco N.');
    expect(log.metadata).toMatchObject({ targetName: 'Olivier Kayitare', days: 30 });
    const d = (await system.get(`/api/admin/users/${c.userId}`)).body;
    expect(d.adminHistory[0]).toMatchObject({ action: 'access.grant', actor: 'Jean Bosco N.', reason: 'MoMo SMS confirmed, callback missing' });
  });

  it('extends from the end of current access (no days lost) and honours a custom length', async () => {
    const c = await candidate();
    await grant(c.userId, -20, 10);
    const res = await system.post(`/api/admin/users/${c.userId}/access`).send({ days: 15, reason: 'goodwill after outage' });
    expect(res.body.access.daysLeft).toBe(25); // 10 left + 15
    const grants = await grantsOf(c.userId);
    expect(grants[1]!.startsAt).toEqual(grants[0]!.endsAt);
  });

  it('suspending needs a reason, signs the user out everywhere at once, and is audited', async () => {
    const c = await candidate('Samuel Niyonzima');
    expect((await system.post(`/api/admin/users/${c.userId}/suspend`).send({ reason: 'no' })).status).toBe(400);
    expect((await c.agent.get('/api/me')).status).toBe(200);
    const res = await system.post(`/api/admin/users/${c.userId}/suspend`).send({ reason: 'shared account' });
    expect(res.status).toBe(200);
    expect((await c.agent.get('/api/me')).status).toBe(401);
    expect(await prisma.session.count({ where: { userId: c.userId } })).toBe(0);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: c.userId } });
    expect([u.status, u.suspendedReason]).toEqual(['SUSPENDED', 'shared account']);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'user.suspend', entityId: c.userId } });
    expect([log.reason, (log.metadata as { targetName: string }).targetName]).toEqual(['shared account', 'Samuel Niyonzima']);
    expect((await system.post(`/api/admin/users/${c.userId}/suspend`).send({ reason: 'again please' })).body.error).toBe('already_suspended');
  });

  it('un-suspending needs a reason too and only works on a suspended account', async () => {
    const c = await candidate();
    expect((await system.post(`/api/admin/users/${c.userId}/unsuspend`).send({ reason: 'not suspended' })).body.error).toBe('not_suspended');
    await system.post(`/api/admin/users/${c.userId}/suspend`).send({ reason: 'checking something' });
    expect((await system.post(`/api/admin/users/${c.userId}/unsuspend`).send({})).status).toBe(400);
    expect((await system.post(`/api/admin/users/${c.userId}/unsuspend`).send({ reason: 'resolved with candidate' })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: c.userId } })).status).toBe('ACTIVE');
    expect(await prisma.auditLog.count({ where: { action: 'user.unsuspend', entityId: c.userId } })).toBe(1);
  });

  it('support can email a candidate a password-reset link (audited, rate-limited, never for a suspended user)', async () => {
    const c = await candidate('Aline Uwase');
    advance(120);
    mail.clear();
    const res = await support.post(`/api/admin/users/${c.userId}/send-password-reset`).send({});
    expect(res.status).toBe(200);
    const token = mail.lastResetToken(c.email)!;
    expect(token).toBeTruthy();
    expect(mail.lastTo(c.email)!.subject).toBe('Reset your JobPrep password');
    expect(JSON.stringify(res.body)).not.toContain(token); // the admin never sees the link
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'password.reset_sent', entityId: c.userId }, include: { actor: true } });
    expect(log.actor?.name).toBe('Support Agent');
    expect(log.metadata).toMatchObject({ targetEmail: c.email, targetName: 'Aline Uwase' });
    const again = await support.post(`/api/admin/users/${c.userId}/send-password-reset`).send({});
    expect(again.status).toBe(429);
    expect(again.body.error).toBe('otp_cooldown');

    await system.post(`/api/admin/users/${c.userId}/suspend`).send({ reason: 'suspended for test' });
    advance(120);
    expect((await support.post(`/api/admin/users/${c.userId}/send-password-reset`).send({})).body.error).toBe('user_suspended');
  });
});

describe('payments', () => {
  let paid: string; let declined: string; let stuck: string; let fresh: string;
  let cPaid: Awaited<ReturnType<typeof candidate>>; let cStuck: Awaited<ReturnType<typeof candidate>>;
  beforeAll(async () => {
    cPaid = await candidate('Aline Uwase');
    paid = await pay(cPaid);
    await simulate(paid, 'success');
    const cDecl = await candidate('Patrick Nshimiye');
    declined = await pay(cDecl, 'AIRTEL_MONEY');
    await simulate(declined, 'decline');
    cStuck = await candidate('Olivier Kayitare');
    stuck = await pay(cStuck);
    advance(11 * 60); // now older than the 10-minute "stuck" threshold, and nobody has refreshed it
    const cFresh = await candidate('Eric Habimana');
    fresh = await pay(cFresh, 'AIRTEL_MONEY');
  });

  const rows = async (qs = '') => (await system.get(`/api/admin/payments?pageSize=100&${qs}`)).body;
  const ids = (b: { results: { id: string }[] }) => b.results.map((r) => r.id);

  it('tabs: pending, paid, failed', async () => {
    expect(ids(await rows('status=pending'))).toEqual(expect.arrayContaining([stuck, fresh]));
    expect(ids(await rows('status=pending'))).not.toContain(paid);
    expect(ids(await rows('status=paid'))).toContain(paid);
    expect(ids(await rows('status=failed'))).toContain(declined);
    expect(ids(await rows('status=failed'))).not.toContain(stuck);
  });

  it('"stuck" means pending for longer than the setting; only those get the manual-grant action', async () => {
    const b = await rows('stuck=true');
    expect(ids(b)).toContain(stuck);
    expect(ids(b)).not.toContain(fresh);
    const all = (await rows()).results as { id: string; stuck: boolean; actions: string[]; waitingMinutes: number | null; status: string }[];
    const get = (id: string) => all.find((r) => r.id === id)!;
    expect(get(stuck)).toMatchObject({ stuck: true, actions: ['check', 'grant'], status: 'PENDING' });
    expect(get(stuck).waitingMinutes).toBeGreaterThanOrEqual(11);
    expect(get(fresh)).toMatchObject({ stuck: false, actions: ['check'] });
    expect(get(paid).actions).toEqual([]);
    expect(get(declined).actions).toEqual([]); // a declined payment can never be granted by hand
    expect((await rows()).stuckAfterMinutes).toBe(10);
  });

  it('a paid row shows when access runs until; a declined row shows why', async () => {
    const all = (await rows()).results as { id: string; accessUntil: string | null; providerLabel: string; priceLabel: string; reference: string; user: { name: string } }[];
    const p = all.find((r) => r.id === paid)!;
    expect(new Date(p.accessUntil!).getTime()).toBeGreaterThan(clock.getTime());
    expect(p).toMatchObject({ providerLabel: 'MTN MoMo', priceLabel: 'RWF 2,000', user: { name: 'Aline Uwase' } });
    expect(p.reference).toMatch(/^FAKE-TXN-/);
    expect((await rows()).results.find((r: { id: string }) => r.id === declined).failureReason).toBe('provider_declined');
  });

  it('filters by provider and searches by candidate, email, phone digits and reference', async () => {
    expect(ids(await rows('provider=AIRTEL_MONEY'))).toEqual(expect.arrayContaining([declined, fresh]));
    expect(ids(await rows('provider=AIRTEL_MONEY'))).not.toContain(paid);
    expect(ids(await rows('q=olivier'))).toEqual([stuck]);
    expect(ids(await rows(`q=${cPaid.msisdn.slice(-6)}`))).toContain(paid);
    expect(ids(await rows(`q=${encodeURIComponent(cPaid.email.toUpperCase())}`))).toContain(paid);
    expect(ids(await rows('q=FAKE-TXN'))).toContain(paid);
    expect((await system.get('/api/admin/payments?status=bogus')).status).toBe(400);
  });

  it('summary: paid today, successful, pending now, failed or expired', async () => {
    const s = (await rows()).summary;
    expect(s.successfulToday).toBeGreaterThanOrEqual(1);
    expect(s.paidToday[0]).toMatchObject({ currencyCode: 'RWF' });
    expect(s.paidToday[0].amountMinor).toBeGreaterThanOrEqual(2000);
    expect(s.pendingNow).toBeGreaterThanOrEqual(2);
    expect(s.failedOrExpiredToday).toBeGreaterThanOrEqual(1);
  });

  it('detail: the timeline of what happened, the user, and the grant', async () => {
    const d = (await system.get(`/api/admin/payments/${paid}`)).body;
    expect(d.payment).toMatchObject({ status: 'SUCCESSFUL', provider: 'MTN_MOMO', priceLabel: 'RWF 2,000' });
    expect(d.user.name).toBe('Aline Uwase');
    expect(d.events.map((e: { source: string }) => e.source)).toContain('webhook');
    expect(d.grant).toMatchObject({ source: 'PAYMENT' });
    expect((await system.get('/api/admin/payments/nope')).body.error).toBe('payment_not_found');
  });

  it('"Check status" asks the operator now: a payment approved without a callback becomes paid, and it is audited', async () => {
    const c = await candidate('Callback Lost');
    const id = await pay(c);
    providers.fake!.settle(`fake_${id}`, 'SUCCESSFUL'); // approved at the operator; no webhook delivered
    const res = await support.post(`/api/admin/payments/${id}/check`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'SUCCESSFUL', changed: true });
    expect(await grantsOf(c.userId)).toHaveLength(1);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'payment.check', entityId: id }, include: { actor: true } });
    expect(log.actor?.name).toBe('Support Agent');
    expect(log.metadata).toMatchObject({ result: 'SUCCESSFUL', previous: 'PENDING' });
    const again = await support.post(`/api/admin/payments/${id}/check`).send({});
    expect(again.body).toMatchObject({ status: 'SUCCESSFUL', changed: false });
  });

  it('manual grant needs the operator transaction id and a reason', async () => {
    for (const body of [{}, { transactionId: 'abc', reason: 'long enough reason' }, { transactionId: 'MP261101.2047.F02' }, { transactionId: 'MP261101.2047.F02', reason: 'no' }]) {
      expect((await system.post(`/api/admin/payments/${stuck}/manual-grant`).send(body)).status).toBe(400);
    }
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: stuck } })).status).toBe('PENDING');
    expect(await grantsOf(cStuck.userId)).toHaveLength(0);
  });

  it('manual grant on a stuck payment: paid, MANUAL grant with who/why/transaction, receipt email, audit, and the tests unlock', async () => {
    mail.clear();
    const res = await system.post(`/api/admin/payments/${stuck}/manual-grant`).send({ transactionId: 'MP261101.2047.F02', reason: 'MoMo SMS confirmed, callback missing' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('SUCCESSFUL');
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: stuck } });
    expect([p.status, p.transactionId]).toEqual(['SUCCESSFUL', 'MP261101.2047.F02']);
    const [g] = await grantsOf(cStuck.userId);
    expect(g).toMatchObject({ source: 'MANUAL', paymentId: stuck, reason: 'MoMo SMS confirmed, callback missing', externalTransactionId: 'MP261101.2047.F02' });
    expect(g!.grantedById).not.toBeNull();
    expect(g!.endsAt.getTime() - g!.startsAt.getTime()).toBe(30 * DAY);
    expect(mail.lastTo(cStuck.email)!.text).toContain('Full Access is active');
    expect((await cStuck.agent.post(`/api/countries/RW/mock-tests/${ACCOUNTANT}/attempts`).send({})).status).toBe(201);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'payment.manual_grant', entityId: stuck }, include: { actor: true } });
    expect(log.actor?.name).toBe('Jean Bosco N.');
    expect(log.reason).toBe('MoMo SMS confirmed, callback missing');
    expect(log.metadata).toMatchObject({ transactionId: 'MP261101.2047.F02', previousStatus: 'PENDING', targetName: 'Olivier Kayitare' });
    const detail = (await system.get(`/api/admin/payments/${stuck}`)).body;
    expect(detail.events.map((e: { source: string }) => e.source)).toContain('admin');
    expect(detail.grant).toMatchObject({ source: 'MANUAL', grantedBy: 'Jean Bosco N.' });
  });

  it('can only be done once, and a late real callback cannot add a second grant', async () => {
    expect((await system.post(`/api/admin/payments/${stuck}/manual-grant`).send({ transactionId: 'MP261101.2047.F02', reason: 'second attempt' })).body.error).toBe('already_paid');
    await simulate(stuck, 'success'); // the operator callback finally arrives
    expect(await grantsOf(cStuck.userId)).toHaveLength(1);
    expect(mail.sent.filter((m) => m.to === cStuck.email && /received/.test(m.text)).length).toBeLessThanOrEqual(1);
  });

  it('never for a declined payment, and one operator transaction can only pay once', async () => {
    expect((await system.post(`/api/admin/payments/${declined}/manual-grant`).send({ transactionId: 'MP-DECLINED-1', reason: 'user says they paid' })).body.error).toBe('payment_declined');
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: declined } })).status).toBe('DECLINED');

    const c = await candidate('Reused Transaction');
    const id = await pay(c);
    advance(11 * 60);
    expect((await system.post(`/api/admin/payments/${id}/manual-grant`).send({ transactionId: 'MP261101.2047.F02', reason: 'same transaction again' })).body.error).toBe('transaction_id_in_use');
    expect(await grantsOf(c.userId)).toHaveLength(0);
  });

  it('works for an expired or failed payment too (the money may have arrived after the timeout)', async () => {
    const c = await candidate('Expired Then Paid');
    const id = await pay(c);
    await simulate(id, 'timeout');
    await c.agent.get(`/api/payments/${id}`); // refresh: expires it
    expect((await prisma.payment.findUniqueOrThrow({ where: { id } })).status).toBe('EXPIRED');
    expect((await system.post(`/api/admin/payments/${id}/manual-grant`).send({ transactionId: 'MP-LATE-0001', reason: 'bank statement shows payment' })).status).toBe(201);
    expect(await grantsOf(c.userId)).toHaveLength(1);

    const f = await candidate('Failed Then Paid');
    const fid = await pay(f);
    await simulate(fid, 'fail');
    expect((await system.post(`/api/admin/payments/${fid}/manual-grant`).send({ transactionId: 'MP-FAILED-0002', reason: 'operator confirmed charge' })).status).toBe(201);
  });
});

describe('overview', () => {
  it('KPIs, needs-attention, chart, most-taken tests and latest payments', async () => {
    // two finished attempts on a test, a report, and demand for an exam that does not exist (any capitalisation)
    const c = await candidate();
    for (let i = 0; i < 2; i++) {
      const s = await c.agent.post(`/api/countries/RW/mock-tests/${MATHS}/attempts`).send({});
      await c.agent.post(`/api/attempts/${s.body.attemptId}/submit`).send({});
    }
    const open = await c.agent.post(`/api/countries/RW/mock-tests/${MATHS}/attempts`).send({}); // one still running
    expect(open.status).toBe(201);
    const q = await prisma.question.findFirstOrThrow({ where: { mockTest: { slug: MATHS } }, orderBy: { sortOrder: 'asc' }, skip: 2 });
    await prisma.questionReport.createMany({ data: [{ questionId: q.id, message: 'Option D is confusing' }, { questionId: q.id, message: 'Typo in the stem' }] });
    for (const query of ['Veterinary officer', 'veterinary OFFICER ', 'Veterinary officer', 'Nurse']) {
      await request(app).post('/api/countries/RW/exam-requests').send({ query });
    }

    const o = (await system.get('/api/admin/overview')).body;
    expect(o.kpis.registeredUsers).toBe(await prisma.user.count());
    expect(o.kpis.newUsersToday).toBeGreaterThan(0);
    const activeUsers = new Set((await prisma.accessGrant.findMany({ where: { status: 'ACTIVE', startsAt: { lte: clock }, endsAt: { gt: clock } }, select: { userId: true } })).map((g) => g.userId));
    expect(o.kpis.fullAccessActive).toBe(activeUsers.size);
    expect(o.kpis.paymentsToday).toBeGreaterThan(0);
    expect(o.kpis.revenueThisMonth[0]).toMatchObject({ currencyCode: 'RWF' });
    expect(o.kpis.revenueThisMonth[0].label).toMatch(/^RWF [\d,]+$/);
    expect(o.kpis.testsStartedToday).toBeGreaterThanOrEqual(3);
    expect(o.kpis.testsCompletedPercentToday).toBeGreaterThan(0);

    expect(o.needsAttention.stuckPayments.count).toBe(await prisma.payment.count({ where: { status: 'PENDING', createdAt: { lte: new Date(clock.getTime() - 10 * 60_000) } } }));
    expect(o.needsAttention.stuckPayments.thresholdMinutes).toBe(10);
    expect(o.needsAttention.reportedQuestions).toMatchObject({ count: expect.any(Number), top: { reports: 2, mockTestTitle: 'Secondary Mathematics Teacher (S1–S3) — Mock 1' } });
    expect(o.needsAttention.examRequests[0]).toEqual({ label: 'Veterinary officer', n: 3 });
    expect(o.needsAttention.examRequests[1]).toEqual({ label: 'Nurse', n: 1 });

    expect(o.chart.days).toHaveLength(14);
    expect(o.chart.signups).toHaveLength(14);
    expect(o.chart.signups.reduce((a: number, b: number) => a + b, 0)).toBe(await prisma.user.count({ where: { createdAt: { gte: new Date(o.chart.days[0] + 'T00:00:00Z') } } }));
    expect(o.chart.payments.reduce((a: number, b: number) => a + b, 0)).toBeGreaterThan(0);

    expect(o.topMockTests[0]).toMatchObject({ title: 'Secondary Mathematics Teacher (S1–S3) — Mock 1', isFree: true });
    expect(o.topMockTests[0].attempts).toBeGreaterThanOrEqual(3);
    expect(o.topMockTests[0].completionPercent).toBeLessThanOrEqual(100);

    expect(o.latestPayments).toHaveLength(5);
    const times = o.latestPayments.map((p: { createdAt: string }) => new Date(p.createdAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(o.latestPayments[0]).toHaveProperty('providerLabel');
  });

  it('can be narrowed to one country; an unknown or out-of-scope country is a 404', async () => {
    const ke = (await system.get('/api/admin/overview?country=KE')).body;
    expect(ke.scope).toEqual(['KE']);
    expect(ke.kpis.registeredUsers).toBe(await prisma.user.count({ where: { countryCode: 'KE' } }));
    expect(ke.kpis.revenueThisMonth).toEqual([]);
    expect((await system.get('/api/admin/overview?country=RW')).body.scope).toEqual(['RW']);
    expect((await system.get('/api/admin/overview?country=R')).status).toBe(400);
  });

  it('the "stuck" threshold follows the admin setting', async () => {
    const before = (await system.get('/api/admin/overview')).body.needsAttention.stuckPayments.count;
    await prisma.setting.update({ where: { key: 'payments.stuckAfterMinutes' }, data: { value: 600 } });
    try {
      const after = (await system.get('/api/admin/overview')).body.needsAttention.stuckPayments;
      expect(after.thresholdMinutes).toBe(600);
      expect(after.count).toBeLessThanOrEqual(before);
    } finally {
      await prisma.setting.update({ where: { key: 'payments.stuckAfterMinutes' }, data: { value: 10 } });
    }
  });
});
