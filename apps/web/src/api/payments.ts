import { api } from './client';
import type { CheckoutSummary, PaymentView } from './types';

export const paymentKeys = {
  checkout: ['me', 'checkout'] as const,
  payment: (id: string) => ['payment', id] as const,
};

export const getCheckout = () => api<CheckoutSummary>('/me/checkout');

export const createPayment = (input: { provider: string; msisdn: string; idempotencyKey?: string }) =>
  api<PaymentView>('/payments', { method: 'POST', body: input });

export const getPayment = (id: string) => api<PaymentView>(`/payments/${encodeURIComponent(id)}`);

/** "Send again" (no number) or "Use a different number" (with `msisdn`). */
export const resendPayment = (id: string, msisdn?: string) =>
  api<PaymentView>(`/payments/${encodeURIComponent(id)}/resend`, { method: 'POST', body: msisdn ? { msisdn } : {} });
