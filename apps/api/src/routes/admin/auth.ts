import { Router } from 'express';
import { z } from 'zod';
import {
  ADMIN_COOKIE, ADMIN_SESSION_HOURS, createAdminSession, destroyAdminSession, requireAdmin,
} from '../../admin/auth';
import { writeAudit } from '../../admin/audit';
import type { Ctx } from '../../http/context';
import { badRequest } from '../../http/errors';
import { requestOtp, verifyOtp } from '../../services/otp';
import { normalizeAdminPhone } from './util';

const phoneBody = z.object({ phone: z.string().min(6).max(24) });
const signInBody = phoneBody.extend({ code: z.string().regex(/^\d{6}$/) });

export function adminAuthRouter(ctx: Ctx) {
  const router = Router();
  const deps = { prisma: ctx.prisma, config: ctx.config, sms: ctx.sms, now: ctx.now };

  /**
   * Same answer whether or not the number belongs to an admin: no SMS is sent to anyone else,
   * and nothing here reveals who the admins are.
   */
  router.post('/otp/request', async (req, res) => {
    const { phone } = phoneBody.parse(req.body);
    const e164 = await normalizeAdminPhone(ctx.prisma, phone);
    if (!e164) throw badRequest('invalid_phone');
    const admin = await ctx.prisma.adminUser.findUnique({ where: { phone: e164 } });
    res.json(await requestOtp(deps, { phone: e164, purpose: 'ADMIN_SIGN_IN', deliver: !!admin?.active }));
  });

  router.post('/sign-in', async (req, res) => {
    const body = signInBody.parse(req.body);
    const e164 = await normalizeAdminPhone(ctx.prisma, body.phone);
    if (!e164) throw badRequest('invalid_phone');
    await verifyOtp(deps, { phone: e164, purpose: 'ADMIN_SIGN_IN', code: body.code });
    const admin = await ctx.prisma.adminUser.findUnique({ where: { phone: e164 }, include: { role: true } });
    if (!admin || !admin.active) throw badRequest('invalid_code');

    const session = await createAdminSession(ctx.prisma, ctx.config.SESSION_SECRET, admin.id, ctx.now(), req.get('user-agent'));
    res.cookie(ADMIN_COOKIE, session.token, {
      httpOnly: true, sameSite: 'strict', secure: ctx.config.NODE_ENV === 'production',
      expires: session.expiresAt, maxAge: ADMIN_SESSION_HOURS * 3_600_000, path: '/',
    });
    await writeAudit(ctx.prisma, admin, { action: 'admin.sign_in', entityType: 'admin', entityId: admin.id, metadata: { name: admin.name } });
    res.json({ admin: { id: admin.id, name: admin.name, role: admin.role.name, permissions: admin.role.permissions, countryScope: admin.countryScope } });
  });

  router.post('/sign-out', async (req, res) => {
    const token = (req as typeof req & { adminToken?: string }).adminToken;
    if (token) await destroyAdminSession(ctx.prisma, ctx.config.SESSION_SECRET, token);
    res.clearCookie(ADMIN_COOKIE, { path: '/' });
    res.status(204).end();
  });

  router.get('/me', requireAdmin, (req, res) => {
    const a = req.admin!;
    res.json({ admin: { id: a.id, name: a.name, phone: a.phone, role: a.role, permissions: a.permissions, countryScope: a.countryScope } });
  });

  return router;
}
