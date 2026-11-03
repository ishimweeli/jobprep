import { Router } from 'express';
import { z } from 'zod';
import { isConsoleEmail, type Ctx } from '../http/context';
import { badRequest, notFound } from '../http/errors';
import { emailInput } from '../domain/email';
import { handleCallback } from '../services/payments';

/**
 * Test-only: lets e2e tests read the verification code / reset token the console email provider "sent".
 * Mounted only when ENABLE_TEST_ENDPOINTS is true, and config forces that off in production.
 */
export function testSupportRouter(ctx: Ctx) {
  const router = Router();

  router.get('/otp', (req, res) => {
    if (!isConsoleEmail(ctx.email)) throw notFound();
    const { email } = z.object({ email: emailInput }).parse(req.query);
    const code = ctx.email.lastCode(email);
    if (!code) throw notFound('no_code_sent');
    res.json({ email, code });
  });

  /** The token in the last password-reset email to an address (console email provider only). */
  router.get('/reset-token', (req, res) => {
    if (!isConsoleEmail(ctx.email)) throw notFound();
    const { email } = z.object({ email: emailInput }).parse(req.query);
    const token = ctx.email.lastResetToken(email);
    if (!token) throw notFound('no_reset_sent');
    res.json({ email, token });
  });

  /**
   * Fake-provider control: settle a payment the way the operator would.
   *  success | decline | fail  → settle at the provider, and deliver the signed webhook (unless deliver:false)
   *  duplicate                → success, delivered twice
   *  timeout                  → leave it unapproved and make it due, so the next status check expires it
   */
  router.post('/payments/:id/simulate', async (req, res) => {
    const fake = ctx.providers.fake;
    if (!fake) throw badRequest('fake_provider_not_enabled');
    const { outcome, deliver } = z.object({
      outcome: z.enum(['success', 'decline', 'fail', 'duplicate', 'timeout']),
      deliver: z.boolean().default(true),
    }).parse(req.body);
    const payment = await ctx.prisma.payment.findUnique({ where: { id: String(req.params.id) } });
    if (!payment?.providerReference) throw notFound('payment_not_found');

    if (outcome === 'timeout') {
      await ctx.prisma.payment.update({ where: { id: payment.id }, data: { expiresAt: ctx.now() } });
      return void res.json({ ok: true });
    }
    fake.settle(payment.providerReference, outcome === 'decline' ? 'DECLINED' : outcome === 'fail' ? 'FAILED' : 'SUCCESSFUL', outcome === 'decline' ? 'APPROVAL_REJECTED' : undefined);
    if (deliver) {
      const cb = fake.callbackFor(payment.providerReference);
      for (let i = 0; i < (outcome === 'duplicate' ? 2 : 1); i++) {
        await handleCallback(ctx, fake, { rawBody: cb.body, headers: cb.headers, query: {} });
      }
    }
    res.json({ ok: true });
  });

  return router;
}
