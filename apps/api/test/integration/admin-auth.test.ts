import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { ConsoleEmailProvider } from '../../src/services/email';
import { ADMINS, adminAgent, resetAndSeed, signedInAgent, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const mail = new ConsoleEmailProvider(() => {});
let clock = new Date('2026-11-02T10:00:00Z');
const config = testConfig();
const app = createApp({ prisma, config, email: mail, now: () => clock });
const advance = (secs: number) => { clock = new Date(clock.getTime() + secs * 1000); };
const HOUR = 3600;

beforeAll(() => resetAndSeed(prisma));
// The clock only moves forward (16 min per test) so the per-email resend wait and hourly cap never cut across tests.
beforeEach(() => { advance(16 * 60); mail.clear(); });
afterAll(() => prisma.$disconnect());

/** An account that holds the given role assignments (no admin sign-in of its own: it is a normal account). */
async function makeAdmin(email: string, roles: { role: 'SYSTEM_ADMIN' | 'CONTENT_EDITOR' | 'SUPPORT'; countryScope?: string[]; active?: boolean }[]) {
  const defs = await prisma.role.findMany();
  return prisma.user.create({
    data: {
      email, name: `Admin ${email.split('@')[0]}`, countryCode: 'RW',
      roles: { create: roles.map((r) => ({ roleId: defs.find((d) => d.name === r.role)!.id, countryScope: r.countryScope ?? [], active: r.active ?? true })) },
    },
  });
}

describe('admins sign in like everyone else', () => {
  it('the normal emailed code and the normal session cookie; no admin cookie; the response lists the roles', async () => {
    const a = request.agent(app);
    expect((await a.post('/api/auth/otp/request').send({ purpose: 'sign_in', email: ADMINS.SYSTEM })).body).toEqual({ cooldownSeconds: 45, expiresInSeconds: 300 });
    const res = await a.post('/api/auth/sign-in').send({ email: ADMINS.SYSTEM, code: mail.lastCode(ADMINS.SYSTEM) });
    expect(res.status).toBe(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/jp_session=/);
    expect(cookie).not.toMatch(/jp_admin/);
    expect(res.body.user).toMatchObject({ name: 'Jean Bosco N.', email: ADMINS.SYSTEM, countryCode: 'RW', roles: ['SYSTEM_ADMIN'] });
    expect((await a.get('/api/me')).body.user.roles).toEqual(['SYSTEM_ADMIN']);
  });

  it('GET /api/admin/me returns the principal: id, name, email, roles, permissions, country scope', async () => {
    const a = await adminAgent(app, mail, ADMINS.EDITOR);
    const me = await a.get('/api/admin/me');
    expect(me.status).toBe(200);
    expect(me.body).toEqual({
      id: expect.any(String), name: 'Marie C.', email: ADMINS.EDITOR,
      roles: [{ code: 'CONTENT_EDITOR', label: 'Content editor' }],
      permissions: ['overview:read', 'exams:read', 'exams:write', 'reports:resolve'],
      countryScope: ['RW'],
    });
    const sys = (await (await adminAgent(app, mail, ADMINS.SYSTEM)).get('/api/admin/me')).body;
    expect(sys).toMatchObject({ roles: [{ code: 'SYSTEM_ADMIN', label: 'System admin' }], countryScope: [] });
    expect(sys.permissions).toContain('payments:grant');
    expect(sys.permissions).toContain('admins:manage');
  });

  it('a plain candidate has roles [] and is refused the admin API (403, not 401: they are signed in)', async () => {
    const { agent: cand } = await signedInAgent(app, mail, 'cand.admin-auth@example.com');
    expect((await cand.get('/api/me')).body.user.roles).toEqual([]);
    for (const path of ['/api/admin/me', '/api/admin/overview', '/api/admin/users', '/api/admin/team']) {
      const res = await cand.get(path);
      expect([res.status, res.body.error], path).toEqual([403, 'admin_forbidden']);
    }
    expect((await cand.post('/api/admin/team').send({ email: 'x@example.com', name: 'X Y', role: 'SYSTEM_ADMIN', reason: 'grab the keys' })).status).toBe(403);
  });

  it('the separate admin sign-in, sign-out and cookie are gone', async () => {
    const sys = await adminAgent(app, mail, ADMINS.SYSTEM);
    for (const [method, path] of [['post', '/api/admin/auth/otp/request'], ['post', '/api/admin/auth/sign-in'], ['post', '/api/admin/auth/sign-out'], ['get', '/api/admin/auth/me']] as const) {
      expect((await sys[method](path).send({ email: ADMINS.SYSTEM })).status, path).toBe(404);
    }
    // an old admin cookie means nothing
    const forged = await request(app).get('/api/admin/me').set('Cookie', 'jp_admin=not-real');
    expect([forged.status, forged.body.error]).toEqual([401, 'admin_sign_in_required']);
    expect((await request(app).get('/api/admin/me').set('Cookie', 'jp_session=not-real')).status).toBe(401);
  });

  it('the code an admin gets is an ordinary sign-in code: tries left on a wrong one, then it works', async () => {
    const a = request.agent(app);
    await a.post('/api/auth/otp/request').send({ purpose: 'sign_in', email: ADMINS.SUPPORT });
    const code = mail.lastCode(ADMINS.SUPPORT)!;
    const wrong = code === '000000' ? '111111' : '000000';
    expect((await a.post('/api/auth/sign-in').send({ email: ADMINS.SUPPORT, code: wrong })).body).toMatchObject({ error: 'invalid_code', triesLeft: 4 });
    expect((await a.post('/api/auth/sign-in').send({ email: ADMINS.SUPPORT, code })).status).toBe(200);
    expect(await prisma.otpCode.count({ where: { purpose: 'SIGN_IN', email: ADMINS.SUPPORT } })).toBeGreaterThan(0);
  });

  it('sign-out is the normal sign-out and ends admin access too', async () => {
    const a = await adminAgent(app, mail, ADMINS.SYSTEM);
    expect((await a.get('/api/admin/me')).status).toBe(200);
    expect((await a.post('/api/auth/sign-out')).status).toBe(204);
    const after = await a.get('/api/admin/me');
    expect([after.status, after.body.error]).toEqual([401, 'admin_sign_in_required']);
  });

  it('only a hash of the session token is stored, and the session is stamped with the sign-in time', async () => {
    const a = request.agent(app);
    await a.post('/api/auth/otp/request').send({ purpose: 'sign_in', email: ADMINS.EDITOR });
    const res = await a.post('/api/auth/sign-in').send({ email: ADMINS.EDITOR, code: mail.lastCode(ADMINS.EDITOR) });
    const token = /jp_session=([^;]+)/.exec(String(res.headers['set-cookie']))![1]!;
    const sessions = await prisma.session.findMany({ where: { user: { email: ADMINS.EDITOR } }, orderBy: { createdAt: 'desc' } });
    expect(sessions.some((s) => s.tokenHash === token)).toBe(false);
    expect(sessions[0]!.createdAt.getTime()).toBe(clock.getTime());
  });
});

describe('who gets in: an active account with an active role, signed in within 12 hours', () => {
  it('no session at all is 401 admin_sign_in_required', async () => {
    const res = await request(app).get('/api/admin/me');
    expect([res.status, res.body.error]).toEqual([401, 'admin_sign_in_required']);
  });

  it('a sign-in older than 12 hours is 401 admin_session_stale: still signed in as a candidate, but must sign in again for admin', async () => {
    const a = await adminAgent(app, mail, ADMINS.SYSTEM);
    advance(11 * HOUR);
    expect((await a.get('/api/admin/me')).status).toBe(200);
    advance(2 * HOUR);
    const stale = await a.get('/api/admin/me');
    expect([stale.status, stale.body.error]).toEqual([401, 'admin_session_stale']);
    expect((await a.get('/api/admin/overview')).body.error).toBe('admin_session_stale');
    expect((await a.get('/api/me')).status).toBe(200); // the normal session lasts 30 days
    // signing in again gives a fresh session, and admin works again
    const again = await adminAgent(app, mail, ADMINS.SYSTEM);
    expect((await again.get('/api/admin/me')).status).toBe(200);
  });

  it('exactly 12 hours is still fine; a role-less person with an old session is told 403, not "sign in again"', async () => {
    const a = await adminAgent(app, mail, ADMINS.SUPPORT);
    advance(12 * HOUR);
    expect((await a.get('/api/admin/me')).status).toBe(200);
    const { agent: cand } = await signedInAgent(app, mail, 'cand.stale@example.com');
    advance(13 * HOUR);
    expect((await cand.get('/api/admin/me')).body.error).toBe('admin_forbidden');
  });

  it('a suspended role-holder is blocked at once and cannot sign in again', async () => {
    const u = await makeAdmin('susp.support@jobprep.test', [{ role: 'SUPPORT' }]);
    const a = await adminAgent(app, mail, u.email);
    expect((await a.get('/api/admin/me')).status).toBe(200);
    await prisma.user.update({ where: { id: u.id }, data: { status: 'SUSPENDED', suspendedReason: 'test' } });
    const blocked = await a.get('/api/admin/me');
    expect([blocked.status, blocked.body.error]).toEqual([401, 'admin_sign_in_required']);
    advance(60);
    await a.post('/api/auth/otp/request').send({ purpose: 'sign_in', email: u.email });
    const again = await a.post('/api/auth/sign-in').send({ email: u.email, code: mail.lastCode(u.email) });
    expect([again.status, again.body.error]).toEqual([403, 'account_suspended']);
  });

  it('removing the last role takes effect on the very next request (same session); adding it back restores it', async () => {
    const u = await makeAdmin('temp.support@jobprep.test', [{ role: 'SUPPORT' }]);
    const a = await adminAgent(app, mail, u.email);
    expect((await a.get('/api/admin/me')).status).toBe(200);
    await prisma.userRole.updateMany({ where: { userId: u.id }, data: { active: false } });
    const gone = await a.get('/api/admin/me');
    expect([gone.status, gone.body.error]).toEqual([403, 'admin_forbidden']);
    expect((await a.get('/api/admin/users')).status).toBe(403);
    expect((await a.get('/api/me')).body.user.roles).toEqual([]);
    await prisma.userRole.updateMany({ where: { userId: u.id }, data: { active: true } });
    expect((await a.get('/api/admin/me')).status).toBe(200);
  });

  it('a person whose only role assignment is inactive gets no admin access even on a fresh sign-in', async () => {
    const u = await makeAdmin('inactive.editor@jobprep.test', [{ role: 'CONTENT_EDITOR', active: false }]);
    const a = await adminAgent(app, mail, u.email); // signing in as a candidate is fine
    expect((await a.get('/api/admin/me')).body.error).toBe('admin_forbidden');
    expect((await a.get('/api/me')).body.user.roles).toEqual([]);
  });
});

describe('several roles on one account', () => {
  it('permissions are the union of the roles', async () => {
    const a = await adminAgent(app, mail, ADMINS.MULTI);
    const me = (await a.get('/api/admin/me')).body;
    expect(me.roles).toEqual([{ code: 'CONTENT_EDITOR', label: 'Content editor' }, { code: 'SUPPORT', label: 'Support' }]);
    expect([...me.permissions].sort()).toEqual([
      'exams:read', 'exams:write', 'otp:resend', 'overview:read', 'payments:check', 'payments:read', 'reports:resolve', 'users:read',
    ]);
    // from the editor role AND from the support role
    expect((await a.get('/api/admin/exams')).status).toBe(200);
    expect((await a.get('/api/admin/users')).status).toBe(200);
    expect((await a.get('/api/admin/payments')).status).toBe(200);
    // from neither
    expect((await a.get('/api/admin/team')).status).toBe(403);
    expect((await a.get('/api/admin/audit')).status).toBe(403);
    expect((await a.post('/api/admin/users/x/suspend').send({ reason: 'not allowed here' })).status).toBe(403);
    expect((await a.get('/api/me')).body.user.roles).toEqual(['CONTENT_EDITOR', 'SUPPORT']);
  });

  it('country scope: all countries if any role is unscoped (a simplification), else the union of the scopes', async () => {
    // editor scoped to Rwanda + support with no scope = every country, for everything
    const multi = await adminAgent(app, mail, ADMINS.MULTI);
    expect((await multi.get('/api/admin/me')).body.countryScope).toEqual([]);
    const ke = await multi.get('/api/admin/exams?country=KE');
    expect(ke.status).toBe(200);
    expect(ke.body.results.length).toBeGreaterThan(0);

    // two scoped roles: the union
    const u = await makeAdmin('scoped.both@jobprep.test', [{ role: 'CONTENT_EDITOR', countryScope: ['RW'] }, { role: 'SUPPORT', countryScope: ['KE'] }]);
    const a = await adminAgent(app, mail, u.email);
    expect((await a.get('/api/admin/me')).body.countryScope).toEqual(['KE', 'RW']);
    expect((await a.get('/api/admin/exams?country=KE')).status).toBe(200);
    expect((await a.get('/api/admin/exams?country=RW')).status).toBe(200);
    expect((await a.get('/api/admin/exams?country=UG')).status).toBe(404); // outside both scopes: 404, as before

    // a single scoped editor stays scoped
    const editor = await adminAgent(app, mail, ADMINS.EDITOR);
    expect((await editor.get('/api/admin/exams?country=KE')).status).toBe(404);
  });

  it('dropping one role narrows the person on the next request, keeping the other', async () => {
    const u = await makeAdmin('drop.one@jobprep.test', [{ role: 'CONTENT_EDITOR', countryScope: ['RW'] }, { role: 'SUPPORT' }]);
    const a = await adminAgent(app, mail, u.email);
    expect((await a.get('/api/admin/users')).status).toBe(200);
    expect((await a.get('/api/admin/me')).body.countryScope).toEqual([]);
    const support = await prisma.role.findUniqueOrThrow({ where: { name: 'SUPPORT' } });
    await prisma.userRole.update({ where: { userId_roleId: { userId: u.id, roleId: support.id } }, data: { active: false } });
    expect((await a.get('/api/admin/users')).status).toBe(403);
    expect((await a.get('/api/admin/exams')).status).toBe(200);
    const me = (await a.get('/api/admin/me')).body;
    expect(me.roles).toEqual([{ code: 'CONTENT_EDITOR', label: 'Content editor' }]);
    expect(me.countryScope).toEqual(['RW']);
    expect((await a.get('/api/admin/exams?country=KE')).status).toBe(404);
  });
});

describe('only the web app may change things (the SameSite=Strict replacement)', () => {
  it('a state-changing admin request from another origin is 403 bad_origin, even before sign-in is checked', async () => {
    const a = await adminAgent(app, mail, ADMINS.SYSTEM);
    for (const [method, path] of [['post', '/api/admin/team'], ['patch', '/api/admin/team/x'], ['put', '/api/admin/settings'], ['post', '/api/admin/users/x/suspend'], ['delete', '/api/admin/questions/x']] as const) {
      const res = await a[method](path).set('Origin', 'https://evil.example').send({});
      expect([res.status, res.body.error], path).toEqual([403, 'bad_origin']);
    }
    const anon = await request(app).post('/api/admin/team').set('Origin', 'https://evil.example').send({});
    expect([anon.status, anon.body.error]).toEqual([403, 'bad_origin']);
    // a look-alike of the right origin is still wrong
    expect((await a.post('/api/admin/users/x/suspend').set('Origin', `${config.WEB_ORIGIN}.evil.example`).send({ reason: 'lookalike origin' })).body.error).toBe('bad_origin');
  });

  it('nothing changed when it was refused', async () => {
    const a = await adminAgent(app, mail, ADMINS.SYSTEM);
    const before = await prisma.userRole.count();
    const res = await a.post('/api/admin/team').set('Origin', 'https://evil.example').send({ email: 'csrf.victim@example.com', name: 'Csrf Victim', role: 'SYSTEM_ADMIN', reason: 'forged request' });
    expect(res.status).toBe(403);
    expect(await prisma.userRole.count()).toBe(before);
    expect(await prisma.user.findUnique({ where: { email: 'csrf.victim@example.com' } })).toBeNull();
  });

  it('the web app\'s own origin is accepted; so is a request with no Origin; reads are never blocked', async () => {
    const a = await adminAgent(app, mail, ADMINS.SYSTEM);
    const own = await a.post('/api/admin/users/nobody/suspend').set('Origin', config.WEB_ORIGIN).send({ reason: 'own origin works' });
    expect([own.status, own.body.error]).toEqual([404, 'user_not_found']); // got past the origin check to the handler
    const none = await a.post('/api/admin/users/nobody/suspend').send({ reason: 'no origin header' });
    expect([none.status, none.body.error]).toEqual([404, 'user_not_found']);
    expect((await a.get('/api/admin/me').set('Origin', 'https://evil.example')).status).toBe(200);
  });
});

describe('admins are ordinary accounts in the user list', () => {
  it('rows and the detail carry the active role codes, so the UI can badge them', async () => {
    const sys = await adminAgent(app, mail, ADMINS.SYSTEM);
    const list = (await sys.get('/api/admin/users?q=jobprep.test&pageSize=100')).body;
    const by = Object.fromEntries(list.results.map((u: { email: string }) => [u.email, u]));
    expect(by[ADMINS.MULTI].roles).toEqual(expect.arrayContaining(['CONTENT_EDITOR', 'SUPPORT']));
    expect(by[ADMINS.SYSTEM].roles).toEqual(['SYSTEM_ADMIN']);
    const { userId } = await signedInAgent(app, mail, 'plain.candidate.roles@example.com');
    expect((await sys.get(`/api/admin/users/${userId}`)).body.user.roles).toEqual([]);
    const multi = await prisma.user.findUniqueOrThrow({ where: { email: ADMINS.MULTI } });
    expect((await sys.get(`/api/admin/users/${multi.id}`)).body.user.roles).toEqual(expect.arrayContaining(['CONTENT_EDITOR', 'SUPPORT']));
  });

  it('support can send anyone a login code, including another admin; the audit line names the address', async () => {
    const support = await adminAgent(app, mail, ADMINS.SUPPORT);
    const multi = await prisma.user.findUniqueOrThrow({ where: { email: ADMINS.MULTI } });
    mail.clear();
    const res = await support.post(`/api/admin/users/${multi.id}/send-login-code`).send({});
    expect(res.status).toBe(200);
    expect(mail.lastCode(ADMINS.MULTI)).toMatch(/^\d{6}$/);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'otp.resend', entityId: multi.id } });
    expect(log.metadata).toMatchObject({ targetEmail: ADMINS.MULTI });
  });

  it('suspending an admin signs them out everywhere, admin access included', async () => {
    const u = await makeAdmin('to.suspend@jobprep.test', [{ role: 'SUPPORT' }]);
    const theirs = await adminAgent(app, mail, u.email);
    const sys = await adminAgent(app, mail, ADMINS.SYSTEM);
    expect((await sys.post(`/api/admin/users/${u.id}/suspend`).send({ reason: 'investigating misuse' })).status).toBe(200);
    expect((await theirs.get('/api/admin/me')).status).toBe(401);
  });
});

describe('every admin route needs an admin session', () => {
  const routes: [string, string][] = [
    ['get', '/api/admin/me'],
    ['get', '/api/admin/overview'], ['get', '/api/admin/users'], ['get', '/api/admin/users/x'], ['post', '/api/admin/users/x/access'],
    ['post', '/api/admin/users/x/suspend'], ['get', '/api/admin/payments'], ['post', '/api/admin/payments/x/manual-grant'],
    ['get', '/api/admin/exams'], ['patch', '/api/admin/questions/x'], ['post', '/api/admin/mock-tests/x/import'], ['get', '/api/admin/reports'],
    ['get', '/api/admin/categories'], ['get', '/api/admin/countries'], ['patch', '/api/admin/countries/KE'], ['get', '/api/admin/settings'],
    ['get', '/api/admin/team'], ['post', '/api/admin/team'], ['patch', '/api/admin/team/x'], ['get', '/api/admin/audit'],
  ];
  it.each(routes)('%s %s → 401 without a session', async (method, path) => {
    const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[method]!(path).send({});
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('admin_sign_in_required');
  });
  it.each(routes)('%s %s → 403 for a signed-in account that holds no role', async (method, path) => {
    const { agent } = await signedInAgent(app, mail, `norole.${method}.${routes.findIndex((r) => r[1] === path && r[0] === method)}@example.com`);
    const res = await (agent as unknown as Record<string, (p: string) => request.Test>)[method]!(path).send({});
    expect([res.status, res.body.error]).toEqual([403, 'admin_forbidden']);
  });
});
