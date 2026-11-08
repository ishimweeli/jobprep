import { api } from './client';
import type { CheckoutSummary, InterviewOption, PaymentView, PlanKey } from './types';

export const paymentKeys = {
  checkout: (plan: PlanKey = 'full_access', option?: InterviewOption) => ['me', 'checkout', plan, option ?? null] as const,
  payment: (id: string) => ['payment', id] as const,
};

/** The order summary for a tier (default Full Access); `option` picks the interview tier's upgrade or full price. */
export const getCheckout = (plan: PlanKey = 'full_access', option?: InterviewOption) =>
  api<CheckoutSummary>('/me/checkout', { query: { plan: plan === 'full_access' ? undefined : plan, option } });

export const createPayment = (input: { provider: string; msisdn: string; idempotencyKey?: string; plan?: PlanKey; option?: InterviewOption }) =>
  api<PaymentView>('/payments', { method: 'POST', body: input });

export const getPayment = (id: string) => api<PaymentView>(`/payments/${encodeURIComponent(id)}`);

/** "Send again" (no number) or "Use a different number" (with `msisdn`). */
export const resendPayment = (id: string, msisdn?: string) =>
  api<PaymentView>(`/payments/${encodeURIComponent(id)}/resend`, { method: 'POST', body: msisdn ? { msisdn } : {} });

/** "Check payment": asks the operator now (also used from the payment history). */
export const checkPayment = (id: string) => api<PaymentView>(`/payments/${encodeURIComponent(id)}/check`, { method: 'POST', body: {} });
