import { Router } from 'express';
import { z } from 'zod';
import { isConsoleSms, type Ctx } from '../http/context';
import { notFound } from '../http/errors';

/**
 * Test-only: lets e2e tests read the OTP the console SMS provider "sent".
 * Mounted only when ENABLE_TEST_ENDPOINTS is true, and config forces that off in production.
 */
export function testSupportRouter(ctx: Ctx) {
  const router = Router();

  router.get('/otp', (req, res) => {
    if (!isConsoleSms(ctx.sms)) throw notFound();
    const { phone } = z.object({ phone: z.string().min(6) }).parse(req.query);
    const code = ctx.sms.lastCode(phone);
    if (!code) throw notFound('no_code_sent');
    res.json({ phone, code });
  });

  return router;
}
