import { Router } from 'express';
import { attachAdmin, requireAdmin } from '../../admin/auth';
import type { Ctx } from '../../http/context';
import { adminAuthRouter } from './auth';
import { adminCatalogRouter } from './catalog';
import { adminCountriesRouter } from './countries';
import { adminExamsRouter } from './exams';
import { adminOverviewRouter } from './overview';
import { adminPaymentsRouter } from './payments';
import { adminUsersRouter } from './users';

/**
 * Everything under /api/admin. The admin session is a separate cookie from the candidate session, so being
 * signed in as one never signs you in as the other. Every route below the auth router needs an admin, and each
 * route names the permission it needs; the permissions come from the admin's role.
 */
export function adminRouter(ctx: Ctx) {
  const router = Router();
  router.use(attachAdmin(ctx));
  router.use('/auth', adminAuthRouter(ctx));
  router.use(requireAdmin);
  router.use(adminOverviewRouter(ctx));
  router.use(adminUsersRouter(ctx));
  router.use(adminPaymentsRouter(ctx));
  router.use(adminExamsRouter(ctx));
  router.use(adminCatalogRouter(ctx));
  router.use(adminCountriesRouter(ctx));
  return router;
}
