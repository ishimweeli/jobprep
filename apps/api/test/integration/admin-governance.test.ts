import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REASON_REQUIRED, describeAudit, writeAudit } from '../../src/admin/audit';
import { createApp } from '../../src/app';
import { createProviderRegistry } from '../../src/payments/registry';
import { ConsoleSmsProvider } from '../../src/services/sms';
import { ADMINS, adminAgent, resetAndSeed, signedInAgent, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const sms = new ConsoleSmsProvider(() => {});
const config = testConfig();
const providers = createProviderRegistry(config);
let clock = new Date();
const app = createApp({ prisma, config, sms, providers, now: () => clock });
const advance = (secs: number) => { clock = new Date(clock.getTime() + secs * 1000); };

type Agent = ReturnType<typeof request.agent>;
let system: Agent;
const audit = (action: string, entityId?: string) => prisma.auditLog.findMany({ where: { action, ...(entityId && { entityId }) }, include: { actor: true }, orderBy: { createdAt: 'asc' } });

beforeAll(async () => {
  await resetAndSeed(prisma);
  system = await adminAgent(app, sms, ADMINS.SYSTEM);
});
afterAll(() => prisma.$disconnect());

describe('countries', () => {
  it('lists every country with status counts, users, tests, waiting list and price', async () => {
    await prisma.waitingListEntry.createMany({ data: [{ countryCode: 'UG', phone: '+256700000001' }, { countryCode: 'UG', phone: '+256700000002' }] });
    const b = (await system.get('/api/admin/countries')).body;
    expect(b.counts).toEqual({ live: 1, preparing: 1, planned: 2 });
    const by = Object.fromEntries(b.countries.map((c: { code: string }) => [c.code, c]));
    expect(by.RW).toMatchObject({ status: 'LIVE', priceLabel: 'RWF 2,000', publishedTests: 12 });
    expect(by.KE).toMatchObject({ status: 'PREPARING', priceLabel: null, publishedTests: 2 });
    expect(by.UG).toMatchObject({ status: 'PLANNED', waitingList: 2, publishedTests: 0 });
  });

  it('Kenya detail: the "ready to launch?" checklist, languages, methods, categories', async () => {
    const b = (await system.get('/api/admin/countries/KE')).body;
    expect(b.country).toMatchObject({ name: 'Kenya', status: 'PREPARING', url: 'jobprep.nexvecta.com/ke', currencyCode: 'KES', dialCode: '+254' });
    expect(b.plan).toMatchObject({ priceMinor: null, priceLabel: null, durationDays: 30, autoRenew: false });
    expect(b.checklist.map((c: { key: string; ok: boolean }) => [c.key, c.ok])).toEqual([['price', false], ['payment', false], ['freeSamples', false], ['legal', false]]);
    expect(b.checklist.find((c: { key: string }) => c.key === 'freeSamples').detail).toContain('County government');
    expect(b.readyToLaunch).toBe(false);
    expect(b.paymentMethods).toEqual([expect.objectContaining({ provider: 'MPESA', mode: 'SANDBOX' }), expect.objectContaining({ provider: 'AIRTEL_MONEY', mode: 'DISABLED' })]);
    expect(b.languages).toEqual([{ code: 'en', completionPercent: 100 }, { code: 'sw', completionPercent: 0 }]);
    expect(b.categories).toHaveLength(6);
  });

  it('language progress counts real translations', async () => {
    const qs = await prisma.question.findMany({ where: { mockTest: { countryCode: 'RW' } }, take: 8 });
    const total = await prisma.question.count({ where: { status: 'PUBLISHED', mockTest: { countryCode: 'RW' } } });
    for (const q of qs) await prisma.questionTranslation.create({ data: { questionId: q.id, language: 'rw', stem: 'Ikibazo', optionTexts: { A: 'a' }, explanation: 'Ibisobanuro' } });
    const rw = (await system.get('/api/admin/countries/RW')).body.languages;
    expect(rw).toEqual([{ code: 'en', completionPercent: 100 }, { code: 'rw', completionPercent: Math.round((8 / total) * 100) }]);
  });

  it('404 for an unknown country', async () => {
    expect((await system.get('/api/admin/countries/XX')).body.error).toBe('country_not_found');
  });
});

describe('price (Full Access plan)', () => {
  it('needs a reason and a positive whole amount', async () => {
    for (const body of [{ priceMinor: 3000 }, { priceMinor: 3000, reason: 'no' }, { priceMinor: 0, reason: 'free for everyone' }, { priceMinor: -5, reason: 'negative price' }, { priceMinor: 12.5, reason: 'fractional amount' }]) {
      expect((await system.patch('/api/admin/countries/RW/plan').send(body)).status).toBe(400);
    }
    expect((await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW' } })).priceMinor).toBe(2000);
  });

  it('changes the price for NEW payments only: open payments keep their price, active access is untouched; it is audited with before and after', async () => {
    const c = await signedInAgent(app, sms, '+250788620001');
    const open = await c.agent.post('/api/payments').send({ provider: 'MTN_MOMO', msisdn: '+250788620001' });
    expect(open.body.priceLabel).toBe('RWF 2,000');
    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW' } });
    await prisma.accessGrant.create({ data: { userId: c.userId, countryCode: 'RW', planId: plan.id, source: 'MANUAL', startsAt: new Date(clock.getTime() - 5 * 86_400_000), endsAt: new Date(clock.getTime() + 20 * 86_400_000) } });

    const res = await system.patch('/api/admin/countries/RW/plan').send({ priceMinor: 3000, reason: 'launch price review' });
    expect(res.body).toMatchObject({ ok: true, priceLabel: 'RWF 3,000' });
    expect((await request(app).get('/api/countries/RW/pricing')).body.fullAccess.priceLabel).toBe('RWF 3,000');
    expect((await c.agent.get('/api/me/checkout')).body.plan.priceLabel).toBe('RWF 3,000');

    await request(app).post(`/api/test/payments/${open.body.id}/simulate`).send({ outcome: 'success' });
    const done = await prisma.payment.findUniqueOrThrow({ where: { id: open.body.id } });
    expect([done.status, done.amountMinor]).toEqual(['SUCCESSFUL', 2000]); // paid what was shown
    const me = (await c.agent.get('/api/me')).body.access.current;
    expect(me.daysLeft).toBe(50); // 20 days left + 30 bought: never shortened

    const log = (await audit('country.plan.set')).at(-1)!;
    expect(log).toMatchObject({ reason: 'launch price review', countryCode: 'RW' });
    expect(log.metadata).toMatchObject({ from: 'RWF 2,000', to: 'RWF 3,000', country: 'Rwanda' });
    expect(describeAudit(log)).toBe('changed the Rwanda Full Access price from RWF 2,000 to RWF 3,000 — reason: launch price review');
    await system.patch('/api/admin/countries/RW/plan').send({ priceMinor: 2000, reason: 'back to the original price' });
  });

  it('sets Kenya\'s price in KES with decimals', async () => {
    const res = await system.patch('/api/admin/countries/KE/plan').send({ priceMinor: 150000, durationDays: 30, reason: 'Kenya launch pricing' });
    expect(res.body.priceLabel).toBe('KES 1,500.00');
    expect((await system.get('/api/admin/countries/KE')).body.checklist.find((c: { key: string }) => c.key === 'price').ok).toBe(true);
  });
});

describe('payment methods', () => {
  it('moves a method between sandbox, live and off, with a reason, audited', async () => {
    expect((await system.patch('/api/admin/countries/KE/payment-methods/MPESA').send({ mode: 'LIVE' })).status).toBe(400);
    const res = await system.patch('/api/admin/countries/KE/payment-methods/MPESA').send({ mode: 'LIVE', reason: 'Safaricom live credentials verified' });
    expect(res.body).toEqual({ ok: true, mode: 'LIVE' });
    expect((await prisma.paymentMethodConfig.findUniqueOrThrow({ where: { countryCode_provider: { countryCode: 'KE', provider: 'MPESA' } } })).mode).toBe('LIVE');
    const log = (await audit('country.payment_method.set')).at(-1)!;
    expect(log.metadata).toMatchObject({ label: 'M-Pesa', from: 'SANDBOX', to: 'LIVE', country: 'Kenya' });
    expect(describeAudit(log)).toContain('set M-Pesa in Kenya to LIVE');
  });

  it('rejects an unknown provider, a mode that does not exist, and a method the country does not have', async () => {
    expect((await system.patch('/api/admin/countries/KE/payment-methods/PAYPAL').send({ mode: 'LIVE', reason: 'not a provider' })).status).toBe(400);
    expect((await system.patch('/api/admin/countries/KE/payment-methods/MPESA').send({ mode: 'TURBO', reason: 'not a mode' })).status).toBe(400);
    expect((await system.patch('/api/admin/countries/RW/payment-methods/MPESA').send({ mode: 'LIVE', reason: 'Rwanda has no M-Pesa' })).body.error).toBe('payment_method_not_found');
  });

  it('switching a method off removes it from checkout', async () => {
    await system.patch('/api/admin/countries/RW/payment-methods/AIRTEL_MONEY').send({ mode: 'DISABLED', reason: 'Airtel maintenance window' });
    const c = await signedInAgent(app, sms, '+250788620002');
    expect((await c.agent.get('/api/me/checkout')).body.paymentMethods.map((m: { provider: string }) => m.provider)).toEqual(['MTN_MOMO']);
    await system.patch('/api/admin/countries/RW/payment-methods/AIRTEL_MONEY').send({ mode: 'SANDBOX', reason: 'maintenance finished' });
  });
});

describe('going live', () => {
  it('is blocked while the checklist is incomplete, and says exactly what is missing', async () => {
    const res = await system.patch('/api/admin/countries/KE').send({ status: 'LIVE', reason: 'try to launch early' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('go_live_blocked');
    const missing = res.body.checklist.filter((c: { ok: boolean }) => !c.ok).map((c: { key: string }) => c.key);
    expect(missing).toEqual(['freeSamples', 'legal']); // price is set and M-Pesa is live from the tests above
    expect((await prisma.country.findUniqueOrThrow({ where: { code: 'KE' } })).status).toBe('PREPARING');
    expect((await request(app).get('/api/countries/KE/landing')).status).toBe(404);
  });

  it('a status change always needs a reason; the failed attempt changes nothing and writes no log', async () => {
    const before = await prisma.auditLog.count();
    const res = await system.patch('/api/admin/countries/KE').send({ status: 'LIVE', force: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('reason_required');
    expect((await prisma.country.findUniqueOrThrow({ where: { code: 'KE' } })).status).toBe('PREPARING');
    expect(await prisma.auditLog.count()).toBe(before);
  });

  it('can be forced with a reason; the log says it was forced; Kenya then works for candidates', async () => {
    const res = await system.patch('/api/admin/countries/KE').send({ status: 'LIVE', force: true, reason: 'pilot launch for acceptance testing' });
    expect(res.status).toBe(200);
    const log = (await audit('country.status.force_live')).at(-1)!;
    expect(log).toMatchObject({ reason: 'pilot launch for acceptance testing', countryCode: 'KE' });
    expect(describeAudit(log)).toContain('forced Kenya live despite an incomplete checklist');
    expect((await request(app).get('/api/countries/KE/landing')).status).toBe(200);
    const ke = await signedInAgent(app, sms, '+254712620001', 'KE');
    expect((await ke.agent.get('/api/me/checkout')).body.plan).toMatchObject({ priceLabel: 'KES 1,500.00', checkoutAvailable: true });
    await system.patch('/api/admin/countries/KE').send({ status: 'PREPARING', reason: 'pilot finished, back to preparing' });
    expect((await request(app).get('/api/countries/KE/landing')).status).toBe(404);
    expect((await audit('country.status.set')).at(-1)!.metadata).toMatchObject({ from: 'LIVE', to: 'PREPARING' });
  });

  it('goes live without forcing once the checklist passes (price, live method, free sample per category, legal review)', async () => {
    // free sample in every Kenya category: remove the empty categories and make the Accountant test free
    const empty = await prisma.category.findMany({ where: { countryCode: 'KE', mockTests: { none: {} } } });
    for (const c of empty) expect((await system.delete(`/api/admin/categories/${c.id}`)).status).toBe(200);
    const acc = await prisma.mockTest.findFirstOrThrow({ where: { countryCode: 'KE', slug: 'accountant-mock-1' } });
    await system.patch(`/api/admin/mock-tests/${acc.id}`).send({ isFree: true });
    expect((await system.patch('/api/admin/countries/KE').send({ legalReviewed: true, reason: 'terms and refund policy reviewed by counsel' })).status).toBe(200);

    const ready = (await system.get('/api/admin/countries/KE')).body;
    expect(ready.checklist.every((c: { ok: boolean }) => c.ok)).toBe(true);
    expect(ready.readyToLaunch).toBe(true);
    expect((await system.patch('/api/admin/countries/KE').send({ status: 'LIVE', reason: 'checklist complete, launching' })).status).toBe(200);
    expect((await audit('country.status.set')).at(-1)!.metadata).toMatchObject({ from: 'PREPARING', to: 'LIVE' });
    expect((await audit('country.legal_reviewed')).at(-1)).toMatchObject({ entityId: 'KE' });
    expect((await request(app).get('/api/countries/KE/mock-tests')).body.total).toBe(2);
  });

  it('can change the footer disclaimer, which candidates see', async () => {
    const text = 'Independent practice platform — not affiliated with the Rwanda Education Board or MIFOTRA.';
    expect((await system.patch('/api/admin/countries/RW').send({ disclaimer: 'short' })).status).toBe(400);
    expect((await system.patch('/api/admin/countries/RW').send({ disclaimer: text })).status).toBe(200);
    expect((await request(app).get('/api/countries/RW')).body.disclaimer).toBe(text);
    expect(await audit('country.disclaimer.set', 'RW')).toHaveLength(1);
  });
});

describe('settings', () => {
  it('reads the current settings', async () => {
    expect((await system.get('/api/admin/settings')).body).toEqual({
      stuckAfterMinutes: 10, showExplanationsOnFreeResults: true, showPassMarks: true, freeSamplesOpenWithoutAccount: true,
    });
  });

  it('updates only what is sent, audits each real change with before and after, and ignores no-ops', async () => {
    const res = await system.put('/api/admin/settings').send({ stuckAfterMinutes: 15, showPassMarks: true });
    expect(res.status).toBe(200);
    const rows = await audit('settings.update');
    expect(rows).toHaveLength(1); // showPassMarks did not change
    expect(rows[0]!.metadata).toMatchObject({ key: 'stuckAfterMinutes', from: 10, to: 15 });
    expect(describeAudit(rows[0]!)).toBe('changed the setting stuckAfterMinutes from 10 to 15');
    expect((await system.get('/api/admin/settings')).body).toMatchObject({ stuckAfterMinutes: 15, showExplanationsOnFreeResults: true });
    await system.put('/api/admin/settings').send({ stuckAfterMinutes: 10, showExplanationsOnFreeResults: false });
    expect((await system.get('/api/admin/settings')).body.showExplanationsOnFreeResults).toBe(false);
    await system.put('/api/admin/settings').send({ showExplanationsOnFreeResults: true });
  });

  it('rejects out-of-range or wrongly typed values', async () => {
    for (const body of [{ stuckAfterMinutes: 0 }, { stuckAfterMinutes: 241 }, { stuckAfterMinutes: 'ten' }, { showPassMarks: 'yes' }]) {
      expect((await system.put('/api/admin/settings').send(body)).status).toBe(400);
    }
  });

  it('"free samples without an account" is a product rule, not a switch', async () => {
    expect((await system.get('/api/admin/settings')).body.freeSamplesOpenWithoutAccount).toBe(true);
    await system.put('/api/admin/settings').send({ freeSamplesOpenWithoutAccount: false });
    expect((await system.get('/api/admin/settings')).body.freeSamplesOpenWithoutAccount).toBe(true);
    expect((await request(app).post('/api/countries/RW/mock-tests/secondary-mathematics-teacher-s1-s3-mock-1/attempts').send({})).status).toBe(201);
  });
});

describe('admin team', () => {
  it('lists the team with roles and country restrictions', async () => {
    const b = (await system.get('/api/admin/team')).body.team;
    expect(b.map((a: { name: string; roleLabel: string }) => [a.name, a.roleLabel])).toEqual([
      ['Jean Bosco N.', 'System admin'], ['Marie C.', 'Content editor'], ['Support Agent', 'Support'],
    ]);
    expect(b[1].countryScope).toEqual(['RW']);
  });

  it('inviting needs a reason, a valid number, a role; a restricted editor can sign in and is limited', async () => {
    const body = { phone: '078 800 0099', name: 'Kenya Editor', role: 'CONTENT_EDITOR', countryScope: ['ke'] };
    expect((await system.post('/api/admin/team').send(body)).status).toBe(400); // no reason
    expect((await system.post('/api/admin/team').send({ ...body, phone: '078', reason: 'new editor for Kenya' })).status).toBe(400);
    expect((await system.post('/api/admin/team').send({ ...body, role: 'OWNER', reason: 'new editor for Kenya' })).status).toBe(400);
    const res = await system.post('/api/admin/team').send({ ...body, reason: 'new editor for Kenya content' });
    expect(res.status).toBe(201);
    expect(res.body.admin).toMatchObject({ phone: '+250788000099', role: 'CONTENT_EDITOR', roleLabel: 'Content editor', countryScope: ['KE'], active: true });
    expect((await system.post('/api/admin/team').send({ ...body, reason: 'duplicate invitation' })).body.error).toBe('admin_exists');
    expect((await system.post('/api/admin/team').send({ phone: '+250788000098', name: 'Bad Admin', role: 'SYSTEM_ADMIN', countryScope: ['RW'], reason: 'scoped system admin' })).body.error).toBe('system_admin_has_all_countries');

    const log = (await audit('admin.invite')).at(-1)!;
    expect(describeAudit(log)).toBe('invited Kenya Editor as Content editor — reason: new editor for Kenya content');

    advance(120);
    const kenya = await adminAgent(app, sms, '+250788000099');
    expect((await kenya.get('/api/admin/exams')).body.results.every((t: { countryCode: string }) => t.countryCode === 'KE')).toBe(true);
    expect((await kenya.get('/api/admin/audit')).status).toBe(403);
  });

  it('changing a role takes effect at once (open sessions end) and is audited', async () => {
    const admin = await prisma.adminUser.findFirstOrThrow({ where: { phone: '+250788000099' } });
    advance(120);
    const s = await adminAgent(app, sms, '+250788000099');
    expect((await s.get('/api/admin/auth/me')).status).toBe(200);
    expect((await system.patch(`/api/admin/team/${admin.id}`).send({ role: 'SUPPORT' })).status).toBe(400); // reason required
    const res = await system.patch(`/api/admin/team/${admin.id}`).send({ role: 'SUPPORT', reason: 'moving to support duties' });
    expect(res.body.admin).toMatchObject({ role: 'SUPPORT', roleLabel: 'Support' });
    expect((await s.get('/api/admin/auth/me')).status).toBe(401);
    const log = (await audit('admin.update', admin.id)).at(-1)!;
    expect(log.metadata).toMatchObject({ name: 'Kenya Editor', change: expect.stringContaining('Content editor → Support') });
    expect((await system.patch(`/api/admin/team/${admin.id}`).send({ reason: 'nothing at all to change' })).body.error).toBe('nothing_to_change');
  });

  it('deactivating ends sessions and blocks sign-in; reactivating restores it; both need a reason', async () => {
    const admin = await prisma.adminUser.findFirstOrThrow({ where: { phone: '+250788000099' } });
    advance(120);
    const s = await adminAgent(app, sms, '+250788000099');
    expect((await system.patch(`/api/admin/team/${admin.id}`).send({ active: false, reason: 'no' })).status).toBe(400);
    await system.patch(`/api/admin/team/${admin.id}`).send({ active: false, reason: 'left the organisation' });
    expect((await s.get('/api/admin/auth/me')).status).toBe(401);
    expect(await audit('admin.deactivate', admin.id)).toHaveLength(1);
    advance(120);
    sms.clear();
    await request(app).post('/api/admin/auth/otp/request').send({ phone: '+250788000099' });
    expect(sms.lastTo('+250788000099')).toBeUndefined();
    await system.patch(`/api/admin/team/${admin.id}`).send({ active: true, reason: 'returned from leave' });
    advance(120);
    expect((await (await adminAgent(app, sms, '+250788000099')).get('/api/admin/auth/me')).status).toBe(200);
  });

  it('nobody can lock themselves out: no changing your own role, no deactivating yourself', async () => {
    const me = await prisma.adminUser.findFirstOrThrow({ where: { phone: ADMINS.SYSTEM } });
    expect((await system.patch(`/api/admin/team/${me.id}`).send({ role: 'SUPPORT', reason: 'demote myself' })).body.error).toBe('cannot_change_own_role');
    expect((await system.patch(`/api/admin/team/${me.id}`).send({ active: false, reason: 'remove myself' })).body.error).toBe('cannot_deactivate_self');
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: me.id } })).active).toBe(true);
    expect((await system.patch('/api/admin/team/nope').send({ name: 'Nobody Here', reason: 'unknown admin' })).status).toBe(404);
  });
});

describe('audit log', () => {
  it('lists newest first, with who, what, where, why and a readable sentence', async () => {
    const b = (await system.get('/api/admin/audit?pageSize=100')).body;
    const times = b.results.map((r: { at: string }) => new Date(r.at).getTime());
    expect(times).toEqual([...times].sort((a, c) => c - a));
    const price = b.results.find((r: { action: string }) => r.action === 'country.plan.set');
    expect(price).toMatchObject({ actor: { name: 'Jean Bosco N.' }, entityType: 'country', countryCode: expect.any(String), reason: expect.any(String) });
    expect(price.summary).toMatch(/^changed the (Rwanda|Kenya) Full Access price from /);
  });

  it('filters by actor, action, entity, country and date, and paginates', async () => {
    const sys = await prisma.adminUser.findFirstOrThrow({ where: { phone: ADMINS.SYSTEM } });
    const all = (await system.get('/api/admin/audit?pageSize=100')).body;
    expect((await system.get(`/api/admin/audit?actorId=${sys.id}&pageSize=100`)).body.results.every((r: { actor: { id: string } }) => r.actor.id === sys.id)).toBe(true);
    expect((await system.get('/api/admin/audit?action=country.&pageSize=100')).body.results.every((r: { action: string }) => r.action.startsWith('country.'))).toBe(true);
    expect((await system.get('/api/admin/audit?entityType=admin&pageSize=100')).body.results.every((r: { entityType: string }) => r.entityType === 'admin')).toBe(true);
    expect((await system.get('/api/admin/audit?country=KE&pageSize=100')).body.results.every((r: { countryCode: string }) => r.countryCode === 'KE')).toBe(true);
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect((await system.get(`/api/admin/audit?from=${encodeURIComponent(future)}`)).body.total).toBe(0);
    const p = (await system.get('/api/admin/audit?pageSize=5&page=2')).body;
    expect([p.page, p.results.length, p.total]).toEqual([2, 5, all.total]);
    expect((await system.get('/api/admin/audit?from=yesterday')).status).toBe(400);
  });

  it('the actions that move money or access cannot be written without a reason', async () => {
    const admin = await prisma.adminUser.findFirstOrThrow({ where: { phone: ADMINS.SYSTEM } });
    for (const action of REASON_REQUIRED) {
      await expect(writeAudit(prisma, admin, { action, entityType: 'x' }), action).rejects.toMatchObject({ code: 'reason_required' });
      await expect(writeAudit(prisma, admin, { action, entityType: 'x', reason: '   ' }), action).rejects.toMatchObject({ code: 'reason_required' });
    }
    await expect(writeAudit(prisma, admin, { action: 'otp.resend', entityType: 'user' })).resolves.toBeDefined(); // not a reason-required action
  });

  it('a failed action does not leave an audit entry behind (the log is written in the same transaction)', async () => {
    const c = await signedInAgent(app, sms, '+250788620077');
    const before = await prisma.auditLog.count({ where: { action: 'user.suspend' } });
    await system.post(`/api/admin/users/${c.userId}/suspend`).send({ reason: 'x' }); // too short → rejected
    expect(await prisma.auditLog.count({ where: { action: 'user.suspend' } })).toBe(before);
  });
});

describe('structural guarantee: every state-changing admin route is audited', () => {
  const dir = join(__dirname, '../../src/routes/admin');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !['index.ts', 'util.ts', 'auth.ts', 'overview.ts'].includes(f));
  const mutating = files.flatMap((file) => {
    const src = readFileSync(join(dir, file), 'utf8');
    const re = /router\.(post|patch|put|delete)\(\s*'([^']+)'/g;
    const starts: { method: string; path: string; at: number }[] = [];
    for (let m = re.exec(src); m; m = re.exec(src)) starts.push({ method: m[1]!, path: m[2]!, at: m.index });
    return starts.map((s, i) => ({ file, ...s, body: src.slice(s.at, starts[i + 1]?.at ?? src.length) }));
  });

  it('finds the mutating routes (guard against the scan silently finding nothing)', () => {
    expect(mutating.length).toBeGreaterThanOrEqual(30);
  });

  it.each(mutating.map((r) => [`${r.method.toUpperCase()} ${r.path}`, r.body, r.file] as const))('%s writes an audit entry', (_name, body) => {
    // writeAudit directly, via the shared report-closing helper, or via the payment core with an in-transaction audit hook
    expect(/writeAudit\(|closeReport\(|inTransaction:/.test(body)).toBe(true);
  });

  it('every audit action used in the code has a readable sentence', () => {
    const actions = new Set<string>();
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/action: (?:'([a-z_.]+)'|status === 'RESOLVED' \? '([a-z_.]+)' : '([a-z_.]+)')/g)) {
        [m[1], m[2], m[3]].filter(Boolean).forEach((a) => actions.add(a!));
      }
    }
    expect(actions.size).toBeGreaterThan(15);
    const generic = new Set(['admin.sign_in', 'country.disclaimer.set', 'country.legal_reviewed', 'category.create', 'category.update', 'category.delete', 'section.create', 'section.update', 'section.delete', 'topic.create', 'topic.update', 'topic.delete', 'case.create', 'case.update', 'case.delete']);
    for (const action of actions) {
      const text = describeAudit({ action, reason: null, metadata: {}, entityId: null });
      expect(text.length, action).toBeGreaterThan(3);
      if (!generic.has(action)) expect(text, `${action} should have its own sentence`).not.toBe(action.replace('.', ' '));
    }
  });
});

void advance;
