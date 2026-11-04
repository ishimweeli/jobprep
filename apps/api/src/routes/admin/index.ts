import { Router } from 'express';
import { principalBody, requireAdmin, requireSameOrigin } from '../../admin/auth';
import type { Ctx } from '../../http/context';
import { adminCatalogRouter } from './catalog';
import { adminCountriesRouter } from './countries';
import { adminDemandRouter } from './demand';
import { adminExamsRouter } from './exams';
import { adminOverviewRouter } from './overview';
import { adminPaymentsRouter } from './payments';
import { adminUsersRouter } from './users';
import { countryCodes, inCodes } from './util';

/**
 * Everything under /api/admin. There is no separate admin login or cookie: the person signs in like anyone else
 * (email + password or Google, normal session cookie) and must hold at least one active role, and have signed in within the
 * last ADMIN_SESSION_HOURS. Each route below names the permission it needs; permissions are the union over the
 * person's active roles. Requests that change data must come from the web app's own origin (CSRF).
 */
export function adminRouter(ctx: Ctx) {
  const router = Router();
  router.use(requireSameOrigin(ctx));
  router.use(requireAdmin(ctx));
  router.get('/me', (req, res) => {
    res.json(principalBody(req.admin!));
  });
  /** The countries this admin may see (for the country filters; needs no permission beyond being an admin). */
  router.get('/country-options', async (req, res) => {
    const countries = await ctx.prisma.country.findMany({ where: { code: inCodes(countryCodes(req.admin!)) }, orderBy: { name: 'asc' }, select: { code: true, name: true, status: true } });
    res.json({ countries });
  });
  router.use(adminOverviewRouter(ctx));
  router.use(adminUsersRouter(ctx));
  router.use(adminPaymentsRouter(ctx));
  router.use(adminExamsRouter(ctx));
  router.use(adminCatalogRouter(ctx));
  router.use(adminCountriesRouter(ctx));
  router.use(adminDemandRouter(ctx));
  return router;
}
