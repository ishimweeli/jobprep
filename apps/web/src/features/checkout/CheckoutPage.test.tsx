import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentView } from '../../api/types';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { CheckoutPage } from './CheckoutPage';

const me = {
  user: { id: 'u1', name: 'Aline Uwase', email: 'aline@example.test', countryCode: 'RW', goalCategoryId: null, language: 'en' },
  country: { code: 'RW', name: 'Rwanda', currencyCode: 'RWF', languages: ['en'] },
  access: { current: null, expired: null, otherCountries: [] },
};
const checkout = {
  country: { code: 'RW', name: 'Rwanda', dialCode: '+250', currencyCode: 'RWF' },
  plan: { name: 'Full Access', priceMinor: 2000, priceLabel: 'RWF 2,000', durationDays: 30, paidOnce: true, checkoutAvailable: true },
  paymentMethods: [
    { provider: 'MTN_MOMO', label: 'MTN MoMo', hint: 'MTN numbers' },
    { provider: 'AIRTEL_MONEY', label: 'Airtel Money', hint: 'Airtel numbers' },
  ],
  prefillPhone: '+250788123456',
  currentAccess: null,
  newAccessEndsAt: '2026-12-02T10:00:00Z',
};
const view = (status: PaymentView['status'], extra: Partial<PaymentView> = {}): PaymentView => ({
  id: 'p1', status, terminal: status !== 'PENDING', provider: 'MTN_MOMO', providerLabel: 'MTN MoMo', msisdn: '+250788123456', amountMinor: 2000,
  priceLabel: 'RWF 2,000', currencyCode: 'RWF', createdAt: '', expiresAt: '', secondsLeft: status === 'PENDING' ? 150 : 0, message: '',
  notCharged: status === 'DECLINED' || status === 'EXPIRED' || status === 'FAILED', approvalHint: '', transactionId: status === 'SUCCESSFUL' ? 'JP-26110-48213' : null,
  confirmedAt: null, access: status === 'SUCCESSFUL' ? { startsAt: '', endsAt: '2026-12-02T10:00:00Z', daysLeft: 30, countryCode: 'RW' } : null,
  canSendAgain: status === 'PENDING', canRetry: status !== 'PENDING' && status !== 'SUCCESSFUL', ...extra,
});

function renderCheckout() {
  return renderWithProviders(
    <Routes>
      <Route path="/:country/checkout" element={<CheckoutPage />} />
    </Routes>,
    { route: '/rw/checkout' },
  );
}

beforeEach(() => {
  localStorage.setItem('jobprep.session', '1');
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function server(sequence: PaymentView[], summary: typeof checkout | (Omit<typeof checkout, 'prefillPhone'> & { prefillPhone: null }) = checkout) {
  const polls = [...sequence];
  return mockFetch((url, init) => {
    if (url === '/api/me') return { body: me };
    if (url === '/api/me/checkout') return { body: summary };
    if (url === '/api/payments' && init?.method === 'POST') return { status: 201, body: view('PENDING') };
    if (url === '/api/payments/p1') return { body: polls.length > 1 ? polls.shift()! : polls[0]! };
    return undefined;
  });
}

describe('checkout screen: poll until the payment settles', () => {
  it('form -> "Approve on your phone" -> polls every 3 s -> "Payment confirmed"', async () => {
    const { calls } = server([view('PENDING'), view('PENDING'), view('SUCCESSFUL')]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderCheckout();

    expect(await screen.findByRole('button', { name: 'Pay RWF 2,000' })).toBeInTheDocument();
    expect(screen.getByLabelText('Mobile Money number')).toHaveValue('078 812 3456'); // prefilled from the payer's last payment
    expect(screen.getByText('You will approve on this phone with your PIN. We never ask for your PIN.')).toBeInTheDocument();
    expect(screen.queryByText(/PIN is/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Airtel Money/ }));
    await user.click(screen.getByRole('button', { name: 'Pay RWF 2,000' }));
    expect(await screen.findByRole('heading', { name: 'Approve on your phone' })).toBeInTheDocument();
    const post = calls.find((c) => c.init?.method === 'POST');
    expect(JSON.parse(String(post?.init?.body))).toMatchObject({ provider: 'AIRTEL_MONEY', msisdn: '+250788123456' });
    expect(JSON.parse(String(post?.init?.body))).not.toHaveProperty('pin');
    expect(screen.getByText(/Waiting for confirmation/)).toBeInTheDocument();

    const polled = () => calls.filter((c) => c.url === '/api/payments/p1').length;
    await waitFor(() => expect(polled()).toBeGreaterThanOrEqual(1));
    const before = polled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    await waitFor(() => expect(polled()).toBeGreaterThan(before));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6200);
    });
    expect(await screen.findByRole('heading', { name: 'Payment confirmed' })).toBeInTheDocument();
    expect(screen.getByText('JP-26110-48213')).toBeInTheDocument();
    expect(screen.getByText('A receipt was sent to aline@example.test.')).toBeInTheDocument();
  });

  it('starts with an empty Mobile Money number when there is no earlier payment', async () => {
    server([view('PENDING')], { ...checkout, prefillPhone: null });
    renderCheckout();
    expect(await screen.findByLabelText('Mobile Money number')).toHaveValue('');
  });

  it('declined: "You were not charged" and "Try again" returns to the form', async () => {
    server([view('PENDING'), view('DECLINED')]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderCheckout();
    await user.click(await screen.findByRole('button', { name: 'Pay RWF 2,000' }));
    await screen.findByRole('heading', { name: 'Approve on your phone' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(await screen.findByRole('heading', { name: 'Payment declined' })).toBeInTheDocument();
    expect(screen.getByText('MTN MoMo declined the request. This can happen if the PIN was wrong or the balance was too low.')).toBeInTheDocument();
    expect(screen.getByText('You were not charged.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay with Airtel Money instead' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Pay RWF 2,000' })).toBeInTheDocument();
  });

  it('rejects a bad number without calling the API', async () => {
    const { calls } = server([view('PENDING')]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderCheckout();
    const input = await screen.findByLabelText('Mobile Money number');
    await user.clear(input);
    await user.type(input, '078 812');
    await user.click(screen.getByRole('button', { name: 'Pay RWF 2,000' }));
    expect(await screen.findByText('Enter a 9-digit Rwanda number, like 788 123 456.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay RWF 2,000' })).toBeDisabled(); // as drawn: disabled until the number is fixed
    expect(calls.some((c) => c.init?.method === 'POST')).toBe(false);
  });
});
