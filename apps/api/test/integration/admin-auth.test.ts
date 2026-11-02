import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { ConsoleSmsProvider } from '../../src/services/sms';
import { ADMINS, resetAndSeed, signedInAgent, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const sms = new ConsoleSmsProvider(() => {});
let clock = new Date('2026-11-02T10:00:00Z');
const app = createApp({ prisma, config: testConfig(), sms, now: () => clock });
const advance = (secs: number) => { clock = new Date(clock.getTime() + secs * 1000); };

beforeAll(() => resetAndSeed(prisma));
// The clock only moves forward (16 min per test) so the per-phone resend wait and hourly cap never cut across tests.
beforeEach(() => { advance(16 * 60); sms.clear(); });
afterAll(() => prisma.$disconnect());

const requestCode = (agent: request.Agent, phone: string) => agent.post('/api/admin/auth/otp/request').send({ phone });

describe('admin sign-in', () => {
  it('phone → code → a separate, httpOnly, strict admin cookie, with the role and permissions', async () => {
    const a = request.agent(app);
    expect((await requestCode(a, ADMINS.SYSTEM)).body).toEqual({ cooldownSeconds: 45, expiresInSeconds: 300 });
    const res = await a.post('/api/admin/auth/sign-in').send({ phone: ADMINS.SYSTEM, code: sms.lastCode(ADMINS.SYSTEM) });
    expect(res.status).toBe(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/jp_admin=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).not.toMatch(/jp_session/);
    expect(res.body.admin).toMatchObject({ name: 'Jean Bosco N.', role: 'SYSTEM_ADMIN', countryScope: [] });
    expect(res.body.admin.permissions).toContain('payments:grant');

    const me = await a.get('/api/admin/auth/me');
    expect(me.body.admin).toMatchObject({ role: 'SYSTEM_ADMIN', phone: ADMINS.SYSTEM });
  });

  it('accepts a local number for a Rwanda admin', async () => {
    const a = request.agent(app);
    expect((await requestCode(a, '078 800 0003')).status).toBe(200);
    expect(sms.lastCode(ADMINS.SUPPORT)).toMatch(/^\d{6}$/);
  });

  it('answers the same for a number that is not an admin, and sends no SMS to it (no discovery of who the admins are)', async () => {
    const a = request.agent(app);
    const known = await requestCode(a, ADMINS.EDITOR);
    sms.clear();
    const unknown = await requestCode(request.agent(app), '+250788999111');
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(sms.lastTo('+250788999111')).toBeUndefined();
    const verify = await request(app).post('/api/admin/auth/sign-in').send({ phone: '+250788999111', code: '123456' });
    expect(verify.status).toBe(400);
    expect(verify.body.error).toBe('invalid_code');
    expect((await requestCode(request.agent(app), '0788')).status).toBe(400);
  });

  it('a wrong code reports tries left; five wrong tries kill the code', async () => {
    const a = request.agent(app);
    await requestCode(a, ADMINS.SUPPORT);
    const good = sms.lastCode(ADMINS.SUPPORT)!;
    const wrong = good === '000000' ? '111111' : '000000';
    const left: unknown[] = [];
    for (let i = 0; i < 5; i++) left.push((await a.post('/api/admin/auth/sign-in').send({ phone: ADMINS.SUPPORT, code: wrong })).body.triesLeft);
    expect(left).toEqual([4, 3, 2, 1, 0]);
    expect((await a.post('/api/admin/auth/sign-in').send({ phone: ADMINS.SUPPORT, code: good })).body.error).toBe('too_many_attempts');
  });

  it('a candidate login code does not sign anyone in as an admin, and an admin code does not work for candidates', async () => {
    const a = request.agent(app);
    // The same person is also a candidate, so a candidate-purpose code really is sent to the admin's own number.
    await prisma.user.upsert({ where: { phone: ADMINS.SYSTEM }, update: {}, create: { phone: ADMINS.SYSTEM, countryCode: 'RW', name: 'Jean Bosco N.' } });
    await a.post('/api/auth/otp/request').send({ purpose: 'sign_in', phone: ADMINS.SYSTEM });
    const candidateCode = sms.lastCode(ADMINS.SYSTEM);
    expect((await a.post('/api/admin/auth/sign-in').send({ phone: ADMINS.SYSTEM, code: candidateCode })).body.error).toBe('invalid_code');
    advance(60);
    await requestCode(a, ADMINS.SYSTEM);
    expect((await a.post('/api/auth/sign-in').send({ phone: ADMINS.SYSTEM, code: sms.lastCode(ADMINS.SYSTEM) })).body.error).toBe('invalid_code');
  });

  it('the admin and candidate sessions are independent', async () => {
    const admin = request.agent(app);
    await requestCode(admin, ADMINS.SYSTEM);
    await admin.post('/api/admin/auth/sign-in').send({ phone: ADMINS.SYSTEM, code: sms.lastCode(ADMINS.SYSTEM) });
    expect((await admin.get('/api/me')).status).toBe(401); // not a candidate
    const { agent: cand } = await signedInAgent(app, sms, '+250788777001');
    expect((await cand.get('/api/admin/auth/me')).status).toBe(401); // not an admin
    expect((await cand.get('/api/admin/overview')).body.error).toBe('admin_sign_in_required');
  });

  it('sign-out ends the admin session', async () => {
    const a = request.agent(app);
    await requestCode(a, ADMINS.SYSTEM);
    await a.post('/api/admin/auth/sign-in').send({ phone: ADMINS.SYSTEM, code: sms.lastCode(ADMINS.SYSTEM) });
    expect((await a.post('/api/admin/auth/sign-out')).status).toBe(204);
    expect((await a.get('/api/admin/auth/me')).status).toBe(401);
  });

  it('an admin session lasts 12 hours, not a month', async () => {
    const a = request.agent(app);
    await requestCode(a, ADMINS.SYSTEM);
    await a.post('/api/admin/auth/sign-in').send({ phone: ADMINS.SYSTEM, code: sms.lastCode(ADMINS.SYSTEM) });
    advance(11 * 3600);
    expect((await a.get('/api/admin/auth/me')).status).toBe(200);
    advance(2 * 3600);
    expect((await a.get('/api/admin/auth/me')).status).toBe(401);
  });

  it('a forged cookie is rejected, and only a hash of the token is stored', async () => {
    expect((await request(app).get('/api/admin/auth/me').set('Cookie', 'jp_admin=not-real')).status).toBe(401);
    const a = request.agent(app);
    await requestCode(a, ADMINS.SYSTEM);
    const res = await a.post('/api/admin/auth/sign-in').send({ phone: ADMINS.SYSTEM, code: sms.lastCode(ADMINS.SYSTEM) });
    const token = /jp_admin=([^;]+)/.exec(String(res.headers['set-cookie']))![1]!;
    expect((await prisma.session.findMany({ where: { adminUserId: { not: null } } })).some((s) => s.tokenHash === token)).toBe(false);
  });

  it('a deactivated admin cannot sign in, and their open session stops working at once', async () => {
    const phone = '+250788555001';
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'SUPPORT' } });
    const admin = await prisma.adminUser.create({ data: { phone, name: 'Temp Support', roleId: role.id } });
    const a = request.agent(app);
    await requestCode(a, phone);
    await a.post('/api/admin/auth/sign-in').send({ phone, code: sms.lastCode(phone) });
    expect((await a.get('/api/admin/auth/me')).status).toBe(200);

    await prisma.adminUser.update({ where: { id: admin.id }, data: { active: false } });
    expect((await a.get('/api/admin/auth/me')).status).toBe(401);
    advance(60);
    sms.clear();
    expect((await requestCode(request.agent(app), phone)).status).toBe(200); // same answer…
    expect(sms.lastTo(phone)).toBeUndefined(); // …but nothing is sent
  });

  it('records each sign-in in the audit log', async () => {
    const before = await prisma.auditLog.count({ where: { action: 'admin.sign_in' } });
    const a = request.agent(app);
    await requestCode(a, ADMINS.EDITOR);
    await a.post('/api/admin/auth/sign-in').send({ phone: ADMINS.EDITOR, code: sms.lastCode(ADMINS.EDITOR) });
    const rows = await prisma.auditLog.findMany({ where: { action: 'admin.sign_in' }, include: { actor: true } });
    expect(rows.length).toBe(before + 1);
    expect(rows.at(-1)!.actor?.name).toBe('Marie C.');
  });
});

describe('every admin route needs an admin', () => {
  const routes: [string, string][] = [
    ['get', '/api/admin/overview'], ['get', '/api/admin/users'], ['get', '/api/admin/users/x'], ['post', '/api/admin/users/x/access'],
    ['post', '/api/admin/users/x/suspend'], ['get', '/api/admin/payments'], ['post', '/api/admin/payments/x/manual-grant'],
    ['get', '/api/admin/exams'], ['patch', '/api/admin/questions/x'], ['post', '/api/admin/mock-tests/x/import'], ['get', '/api/admin/reports'],
    ['get', '/api/admin/categories'], ['get', '/api/admin/countries'], ['patch', '/api/admin/countries/KE'], ['get', '/api/admin/settings'],
    ['get', '/api/admin/team'], ['post', '/api/admin/team'], ['get', '/api/admin/audit'],
  ];
  it.each(routes)('%s %s → 401 without an admin session', async (method, path) => {
    const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[method]!(path).send({});
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('admin_sign_in_required');
  });
});
