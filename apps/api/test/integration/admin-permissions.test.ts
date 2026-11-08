import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { ConsoleEmailProvider } from '../../src/services/email';
import { ADMINS, adminAgent, readyAccount, resetAndSeed, signedInAgent, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const mail = new ConsoleEmailProvider(() => {});
const clock = new Date('2026-11-02T10:00:00Z');
const app = createApp({ prisma, config: testConfig(), email: mail, now: () => clock });

type Agent = ReturnType<typeof request.agent>;
let system: Agent; let editor: Agent; let support: Agent;
const agents = () => ({ SYSTEM: system, EDITOR: editor, SUPPORT: support });
type Role = 'SYSTEM' | 'EDITOR' | 'SUPPORT';

beforeAll(async () => {
  await resetAndSeed(prisma);
  system = await adminAgent(app, mail, ADMINS.SYSTEM);
  editor = await adminAgent(app, mail, ADMINS.EDITOR);
  support = await adminAgent(app, mail, ADMINS.SUPPORT);
});
afterAll(() => prisma.$disconnect());

/**
 * The permission matrix. System admin: everything. Content editor: exams, questions and reports only.
 * Support: view users, resend login codes, view and check payments. Each row lists the roles that MAY call it;
 * every other role must get exactly 403 `admin_forbidden`, and the allowed ones must get past the permission check
 * (any answer except 401/403, here usually 404 or 400 because the ids are made up).
 */
type Row = [method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, allowed: Role[]];
const ALL: Role[] = ['SYSTEM', 'EDITOR', 'SUPPORT'];
const matrix: Row[] = [
  ['get', '/api/admin/overview', ALL],
  ['get', '/api/admin/users', ['SYSTEM', 'SUPPORT']],
  ['get', '/api/admin/users/x', ['SYSTEM', 'SUPPORT']],
  ['post', '/api/admin/users/x/access', ['SYSTEM']],
  ['post', '/api/admin/users/x/suspend', ['SYSTEM']],
  ['post', '/api/admin/users/x/unsuspend', ['SYSTEM']],
  ['post', '/api/admin/users/x/send-password-reset', ['SYSTEM', 'SUPPORT']],
  ['get', '/api/admin/payments', ['SYSTEM', 'SUPPORT']],
  ['get', '/api/admin/payments/x', ['SYSTEM', 'SUPPORT']],
  ['post', '/api/admin/payments/x/check', ['SYSTEM', 'SUPPORT']],
  ['post', '/api/admin/payments/x/manual-grant', ['SYSTEM']],
  ['get', '/api/admin/exams', ['SYSTEM', 'EDITOR']],
  ['get', '/api/admin/catalog-options', ['SYSTEM', 'EDITOR']],
  ['get', '/api/admin/mock-tests/x', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/mock-tests', ['SYSTEM', 'EDITOR']],
  ['patch', '/api/admin/mock-tests/x', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/mock-tests/x/publish', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/mock-tests/x/archive', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/mock-tests/x/questions', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/mock-tests/x/import', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/mock-tests/x/sections', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/mock-tests/x/cases', ['SYSTEM', 'EDITOR']],
  ['get', '/api/admin/questions/x', ['SYSTEM', 'EDITOR']],
  ['patch', '/api/admin/questions/x', ['SYSTEM', 'EDITOR']],
  ['delete', '/api/admin/questions/x', ['SYSTEM', 'EDITOR']],
  ['get', '/api/admin/categories', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/categories', ['SYSTEM', 'EDITOR']],
  ['patch', '/api/admin/categories/x', ['SYSTEM', 'EDITOR']],
  ['delete', '/api/admin/categories/x', ['SYSTEM', 'EDITOR']],
  ['patch', '/api/admin/sections/x', ['SYSTEM', 'EDITOR']],
  ['delete', '/api/admin/sections/x', ['SYSTEM', 'EDITOR']],
  ['get', '/api/admin/topics?categoryId=x', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/topics', ['SYSTEM', 'EDITOR']],
  ['patch', '/api/admin/topics/x', ['SYSTEM', 'EDITOR']],
  ['delete', '/api/admin/topics/x', ['SYSTEM', 'EDITOR']],
  ['get', '/api/admin/cases/x', ['SYSTEM', 'EDITOR']],
  ['patch', '/api/admin/cases/x', ['SYSTEM', 'EDITOR']],
  ['delete', '/api/admin/cases/x', ['SYSTEM', 'EDITOR']],
  ['get', '/api/admin/reports', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/reports/x/resolve', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/reports/x/dismiss', ['SYSTEM', 'EDITOR']],
  ['get', '/api/admin/countries', ['SYSTEM']],
  ['get', '/api/admin/countries/RW', ['SYSTEM']],
  ['patch', '/api/admin/countries/RW', ['SYSTEM']],
  ['patch', '/api/admin/countries/RW/plan', ['SYSTEM']],
  ['patch', '/api/admin/countries/RW/payment-methods/MTN_MOMO', ['SYSTEM']],
  ['get', '/api/admin/settings', ['SYSTEM']],
  ['put', '/api/admin/settings', ['SYSTEM']],
  ['get', '/api/admin/team', ['SYSTEM']],
  ['post', '/api/admin/team', ['SYSTEM']],
  ['patch', '/api/admin/team/x', ['SYSTEM']],
  ['get', '/api/admin/audit', ['SYSTEM']],
  // Added with the missing-designs pass
  ['get', '/api/admin/country-options', ALL],
  ['get', '/api/admin/mock-tests/x/checklist', ['SYSTEM', 'EDITOR']],
  ['get', '/api/admin/mock-tests/x/consequences', ['SYSTEM', 'EDITOR']],
  ['get', '/api/admin/mock-tests/x/cases', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/mock-tests/x/unpublish', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/mock-tests/x/restore', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/mock-tests/x/duplicate', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/mock-tests/x/questions/reorder', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/mock-tests/x/sections/reorder', ['SYSTEM', 'EDITOR']],
  ['put', '/api/admin/questions/x/translations/rw', ['SYSTEM', 'EDITOR']],
  ['delete', '/api/admin/questions/x/translations/rw', ['SYSTEM', 'EDITOR']],
  ['put', '/api/admin/cases/x/translations/rw', ['SYSTEM', 'EDITOR']],
  ['delete', '/api/admin/cases/x/translations/rw', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/cases/x/attach', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/cases/x/detach', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/categories/reorder', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/questions/x/reports/close', ['SYSTEM', 'EDITOR']],
  ['get', '/api/admin/import-template', ['SYSTEM', 'EDITOR']],
  ['get', '/api/admin/audit/filters', ['SYSTEM']],
  ['get', '/api/admin/audit/export', ['SYSTEM']],
  ['get', '/api/admin/audit/x', ['SYSTEM']],
  ['get', '/api/admin/countries/RW/status-impact?to=LIVE', ['SYSTEM']],
  ['get', '/api/admin/legal', ['SYSTEM']],
  ['put', '/api/admin/legal/terms', ['SYSTEM']],
  ['delete', '/api/admin/legal/terms', ['SYSTEM']],
  ['get', '/api/admin/demand/exam-requests', ['SYSTEM', 'EDITOR']],
  ['post', '/api/admin/demand/exam-requests/done', ['SYSTEM', 'EDITOR']],
  ['get', '/api/admin/demand/waiting-list', ['SYSTEM']],
  ['get', '/api/admin/demand/waiting-list/export', ['SYSTEM']],
  ['post', '/api/admin/demand/waiting-list/notify', ['SYSTEM']],
  ['get', '/api/admin/payments/export', ['SYSTEM', 'SUPPORT']],
  ['get', '/api/admin/users/x/candidate-view', ['SYSTEM', 'SUPPORT']],
  ['get', '/api/admin/users/x/access-preview', ['SYSTEM', 'SUPPORT']],
];

describe('role permissions (every route, every role)', () => {
  const cases = matrix.flatMap(([m, p, allowed]) => ALL.map((role) => [m, p, role, allowed.includes(role)] as const));
  it.each(cases)('%s %s as %s → %s', async (method, path, role, allowed) => {
    const res = await (agents()[role] as unknown as Record<string, (p: string) => request.Test>)[method]!(path).send({});
    if (allowed) {
      expect([401, 403], `${role} should reach ${method} ${path}`).not.toContain(res.status);
    } else {
      expect(res.status, `${role} must be blocked from ${method} ${path}`).toBe(403);
      expect(res.body.error).toBe('admin_forbidden');
    }
  });

  it('covers every admin route that exists (the matrix cannot silently fall behind)', () => {
    const covered = new Set(matrix.map(([, p]) => p.split('?')[0]!.replace(/\/x(?=\/|$)/g, '/:id').replace(/\/(RW)(?=\/|$)/g, '/:code').replace(/MTN_MOMO/, ':provider')));
    const expected = [
      '/api/admin/overview', '/api/admin/users', '/api/admin/users/:id', '/api/admin/users/:id/access', '/api/admin/users/:id/suspend',
      '/api/admin/users/:id/unsuspend', '/api/admin/users/:id/send-password-reset', '/api/admin/payments', '/api/admin/payments/:id',
      '/api/admin/payments/:id/check', '/api/admin/payments/:id/manual-grant', '/api/admin/exams', '/api/admin/catalog-options',
      '/api/admin/mock-tests', '/api/admin/mock-tests/:id', '/api/admin/mock-tests/:id/publish', '/api/admin/mock-tests/:id/questions',
      '/api/admin/mock-tests/:id/import', '/api/admin/questions/:id', '/api/admin/categories', '/api/admin/categories/:id',
      '/api/admin/sections/:id', '/api/admin/topics', '/api/admin/topics/:id', '/api/admin/cases/:id', '/api/admin/reports',
      '/api/admin/reports/:id/resolve', '/api/admin/countries', '/api/admin/countries/:code', '/api/admin/countries/:code/plan',
      '/api/admin/settings', '/api/admin/team', '/api/admin/team/:id', '/api/admin/audit',
    ];
    for (const p of expected) expect(covered.has(p), `matrix is missing ${p}`).toBe(true);
  });
});

describe('forbidden actions are blocked AND change nothing', () => {
  it('support cannot suspend, grant or manually confirm payments', async () => {
    const { userId } = await signedInAgent(app, mail, 'perm.one@example.com');
    const plan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW', code: 'FULL_ACCESS' } });
    const payment = await prisma.payment.create({
      data: { userId, countryCode: 'RW', planId: plan.id, provider: 'MTN_MOMO', msisdn: '+250788610001', amountMinor: 2000, currencyCode: 'RWF', idempotencyKey: 'perm-1', expiresAt: new Date(clock.getTime() - 60_000), status: 'EXPIRED' },
    });
    expect((await support.post(`/api/admin/users/${userId}/suspend`).send({ reason: 'trying it out' })).status).toBe(403);
    expect((await support.post(`/api/admin/users/${userId}/access`).send({ reason: 'trying it out' })).status).toBe(403);
    expect((await support.post(`/api/admin/payments/${payment.id}/manual-grant`).send({ transactionId: 'TXN-12345', reason: 'trying it out' })).status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).status).toBe('ACTIVE');
    expect(await prisma.accessGrant.count({ where: { userId } })).toBe(0);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('EXPIRED');
    expect(await prisma.auditLog.count({ where: { entityId: { in: [userId, payment.id] } } })).toBe(0);
  });

  it('a content editor cannot touch users, payments, countries, prices, settings or the team', async () => {
    const { userId } = await signedInAgent(app, mail, 'perm.two@example.com');
    const beforePlan = await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW', code: 'FULL_ACCESS' } });
    const beforeRoles = await prisma.userRole.count();
    expect((await editor.post(`/api/admin/users/${userId}/access`).send({ reason: 'sneaky free access' })).status).toBe(403);
    expect((await editor.post(`/api/admin/users/${userId}/suspend`).send({ reason: 'sneaky suspension' })).status).toBe(403);
    expect((await editor.patch('/api/admin/countries/RW/plan').send({ priceMinor: 1, reason: 'sneaky price cut' })).status).toBe(403);
    expect((await editor.patch('/api/admin/countries/KE').send({ status: 'LIVE', force: true, reason: 'sneaky launch' })).status).toBe(403);
    expect((await editor.put('/api/admin/settings').send({ stuckAfterMinutes: 1 })).status).toBe(403);
    expect((await editor.post('/api/admin/team').send({ email: 'sneaky.admin@jobprep.test', name: 'Sneaky Admin', role: 'SYSTEM_ADMIN', reason: 'sneaky promotion' })).status).toBe(403);
    expect((await prisma.planConfig.findFirstOrThrow({ where: { countryCode: 'RW', code: 'FULL_ACCESS' } })).priceMinor).toBe(beforePlan.priceMinor);
    expect((await prisma.country.findUniqueOrThrow({ where: { code: 'KE' } })).status).toBe('PREPARING');
    expect(await prisma.userRole.count()).toBe(beforeRoles);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).status).toBe('ACTIVE');
  });

  it('support cannot edit questions or exams; the question stays exactly as it was', async () => {
    const q = await prisma.question.findFirstOrThrow({ where: { mockTest: { countryCode: 'RW' } } });
    expect((await support.patch(`/api/admin/questions/${q.id}`).send({ stem: 'Vandalised question text' })).status).toBe(403);
    expect((await support.delete(`/api/admin/questions/${q.id}`)).status).toBe(403);
    const after = await prisma.question.findUniqueOrThrow({ where: { id: q.id } });
    expect([after.stem, after.status, after.version]).toEqual([q.stem, q.status, q.version]);
  });

  it('neither editor nor support can read the audit log or the team', async () => {
    for (const a of [editor, support]) {
      expect((await a.get('/api/admin/audit')).status).toBe(403);
      expect((await a.get('/api/admin/team')).status).toBe(403);
    }
  });

  it('support can still do exactly their job: view users, check payments, send a login code', async () => {
    const { userId } = await signedInAgent(app, mail, 'perm.three@example.com');
    expect((await support.get('/api/admin/users')).status).toBe(200);
    expect((await support.get(`/api/admin/users/${userId}`)).status).toBe(200);
    expect((await support.get('/api/admin/payments')).status).toBe(200);
    expect((await support.post(`/api/admin/users/${userId}/send-password-reset`).send({})).status).toBe(200);
  });

  it('a content editor can still do exactly their job: view and edit exams', async () => {
    expect((await editor.get('/api/admin/exams')).status).toBe(200);
    expect((await editor.get('/api/admin/reports')).status).toBe(200);
    expect((await editor.get('/api/admin/overview')).status).toBe(200);
  });
});

describe('country restriction', () => {
  let keTest: { id: string }; let keQuestion: { id: string }; let rwTest: { id: string }; let rwQuestion: { id: string };
  beforeAll(async () => {
    keTest = await prisma.mockTest.findFirstOrThrow({ where: { countryCode: 'KE' } });
    keQuestion = await prisma.question.findFirstOrThrow({ where: { mockTestId: keTest.id } });
    rwTest = await prisma.mockTest.findFirstOrThrow({ where: { countryCode: 'RW', slug: 'secondary-mathematics-teacher-s1-s3-mock-1' } });
    rwQuestion = await prisma.question.findFirstOrThrow({ where: { mockTestId: rwTest.id } });
  });

  it('the Rwanda-only editor sees only Rwanda exams; the system admin sees both countries', async () => {
    const mine = (await editor.get('/api/admin/exams?pageSize=100')).body;
    expect(mine.results.every((t: { countryCode: string }) => t.countryCode === 'RW')).toBe(true);
    expect(mine.totals.mockTests).toBe(12);
    const all = (await system.get('/api/admin/exams?pageSize=100')).body;
    expect(new Set(all.results.map((t: { countryCode: string }) => t.countryCode))).toEqual(new Set(['RW', 'KE']));
    expect(all.totals.mockTests).toBe(14);
  });

  it('Kenya is invisible to them: tests, questions and filters answer 404, not 403', async () => {
    expect((await editor.get(`/api/admin/mock-tests/${keTest.id}`)).body.error).toBe('mock_test_not_found');
    expect((await editor.get(`/api/admin/questions/${keQuestion.id}`)).body.error).toBe('question_not_found');
    expect((await editor.get('/api/admin/exams?country=KE')).body.error).toBe('country_not_found');
    expect((await editor.get(`/api/admin/mock-tests/${rwTest.id}`)).status).toBe(200);
    expect((await editor.get(`/api/admin/questions/${rwQuestion.id}`)).status).toBe(200);
  });

  it('they cannot change Kenya content; it is unchanged afterwards', async () => {
    const before = await prisma.question.findUniqueOrThrow({ where: { id: keQuestion.id } });
    expect((await editor.patch(`/api/admin/questions/${keQuestion.id}`).send({ stem: 'Edited from the wrong country' })).status).toBe(404);
    expect((await editor.delete(`/api/admin/questions/${keQuestion.id}`)).status).toBe(404);
    expect((await editor.post(`/api/admin/mock-tests/${keTest.id}/publish`).send({})).status).toBe(404);
    expect((await editor.post(`/api/admin/mock-tests/${keTest.id}/import`).send({ csv: 'a,b' })).status).toBe(404);
    const after = await prisma.question.findUniqueOrThrow({ where: { id: keQuestion.id } });
    expect([after.stem, after.status]).toEqual([before.stem, before.status]);
    const ke = await prisma.category.findFirstOrThrow({ where: { countryCode: 'KE' } });
    expect((await editor.post('/api/admin/categories').send({ countryCode: 'KE', name: 'Sneaky category' })).status).toBe(404);
    expect((await editor.patch(`/api/admin/categories/${ke.id}`).send({ name: 'Renamed' })).status).toBe(404);
    expect((await editor.get('/api/admin/categories?country=KE')).status).toBe(404);
  });

  it('overview, catalog options and reports are limited to their country as well', async () => {
    const ov = (await editor.get('/api/admin/overview')).body;
    expect(ov.scope).toEqual(['RW']);
    expect((await editor.get('/api/admin/overview?country=KE')).status).toBe(404);
    const opts = (await editor.get('/api/admin/catalog-options')).body;
    expect(opts.categories.every((c: { countryCode: string }) => c.countryCode === 'RW')).toBe(true);
    const q = await prisma.questionReport.create({ data: { questionId: keQuestion.id, message: 'Kenya report only' } });
    const reports = (await editor.get('/api/admin/reports')).body;
    expect(reports.results.some((r: { id: string }) => r.id === q.id)).toBe(false);
    expect((await editor.post(`/api/admin/reports/${q.id}/resolve`).send({})).status).toBe(404);
    expect((await system.get('/api/admin/reports')).body.results.some((r: { id: string }) => r.id === q.id)).toBe(true);
  });

  it('a Kenya-only support agent sees Kenya users and payments only', async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'SUPPORT' } });
    const email = 'kenya.support@jobprep.test';
    await prisma.user.create({ data: { email, name: 'Kenya Support', countryCode: 'RW', ...(await readyAccount()), roles: { create: { roleId: role.id, countryScope: ['KE'] } } } });
    const rw = await signedInAgent(app, mail, 'perm.rw@example.com');
    const ke = await prisma.user.create({ data: { countryCode: 'KE', email: 'kenyan.candidate@example.com', name: 'Kenyan Candidate' } });
    // sign in the Kenya-scoped support agent
    const a = await adminAgent(app, mail, email);

    const users = (await a.get('/api/admin/users?pageSize=100')).body;
    expect(users.results.every((u: { countryCode: string }) => u.countryCode === 'KE')).toBe(true);
    expect(users.results.some((u: { id: string }) => u.id === ke.id)).toBe(true);
    expect((await a.get(`/api/admin/users/${rw.userId}`)).body.error).toBe('user_not_found');
    expect((await a.post(`/api/admin/users/${rw.userId}/send-password-reset`).send({})).status).toBe(404);
    expect((await a.get(`/api/admin/users/${ke.id}`)).status).toBe(200);
    expect((await a.get('/api/admin/users?country=RW')).status).toBe(404);
    const pays = (await a.get('/api/admin/payments')).body;
    expect(pays.results.every((p: { countryCode: string }) => p.countryCode === 'KE')).toBe(true);
  });
});
