import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentRow } from '../../api/types';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { PaymentHistoryPage } from './PaymentHistoryPage';
import { PaymentReceiptPage } from './PaymentReceiptPage';

beforeEach(() => localStorage.setItem('jobprep.session', '1'));
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const row = (over: Partial<PaymentRow>): PaymentRow => ({
  id: 'p1', createdAt: '2026-11-01T10:00:00Z', status: 'SUCCESSFUL', providerLabel: 'MTN MoMo', priceLabel: 'RWF 2,000', amountMinor: 2000, currencyCode: 'RWF', countryCode: 'RW',
  transactionId: 'TX-1', accessUntil: '2026-12-01T00:00:00Z', canCheck: false, ...over,
});

const renderList = () =>
  renderWithProviders(
    <Routes>
      <Route path="/account/payments" element={<PaymentHistoryPage />} />
    </Routes>,
    { route: '/account/payments' },
  );

describe('payment history (C21)', () => {
  it('lists payments with status, details and a link to the receipt; "not charged" on a failed one', async () => {
    mockFetch((url) =>
      url.startsWith('/api/me/payments')
        ? { body: { total: 2, page: 1, pageSize: 20, hasMore: false, payments: [row({}), row({ id: 'p2', status: 'DECLINED', transactionId: null, accessUntil: null })] } }
        : undefined,
    );
    renderList();
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('RWF 2,000');
    expect(items[0]).toHaveTextContent('Paid');
    expect(items[0]).toHaveTextContent('MTN MoMo · ID TX-1 · Access until 1 Dec 2026');
    expect(items[1]).toHaveTextContent('Declined');
    expect(items[1]).toHaveTextContent('You were not charged.');
    expect(screen.getAllByRole('link', { name: /RWF 2,000/ })[0]).toHaveAttribute('href', '/account/payments/p1');
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('an empty history says so', async () => {
    mockFetch(() => ({ body: { total: 0, page: 1, pageSize: 20, hasMore: false, payments: [] } }));
    renderList();
    expect(await screen.findByText('No payments yet')).toBeInTheDocument();
  });

  it('"Check payment" on a pending one asks the operator and says what came back', async () => {
    const { calls } = mockFetch((url, init) => {
      if (url === '/api/payments/p3/check' && init?.method === 'POST') return { body: { id: 'p3', status: 'PENDING' } };
      if (url.startsWith('/api/me/payments')) return { body: { total: 1, page: 1, pageSize: 20, hasMore: false, payments: [row({ id: 'p3', status: 'PENDING', canCheck: true, transactionId: null, accessUntil: null })] } };
      return undefined;
    });
    const u = userEvent.setup();
    renderList();
    await u.click(await screen.findByRole('button', { name: 'Check payment' }));
    expect(await screen.findByText(/Still waiting for approval/)).toBeInTheDocument();
    expect(calls.some((c) => c.url === '/api/payments/p3/check')).toBe(true);
  });

  it('Load more appears when there is another page', async () => {
    mockFetch((url) => (url.startsWith('/api/me/payments') ? { body: { total: 30, page: 1, pageSize: 20, hasMore: true, payments: [row({})] } } : undefined));
    renderList();
    expect(await screen.findByRole('button', { name: 'Load more' })).toBeInTheDocument();
  });
});

describe('receipt (C21)', () => {
  const renderReceipt = () =>
    renderWithProviders(
      <Routes>
        <Route path="/account/payments/:paymentId" element={<PaymentReceiptPage />} />
      </Routes>,
      { route: '/account/payments/p1' },
    );
  const payment = (status: string) => ({ id: 'p1', status, providerLabel: 'MTN MoMo', priceLabel: 'RWF 2,000', createdAt: '2026-11-01T10:00:00Z', transactionId: 'TX-1' });

  it('a paid payment shows the receipt rows', async () => {
    mockFetch(() => ({
      body: {
        payment: payment('SUCCESSFUL'),
        receipt: { number: 'TX-1', issuedTo: { name: 'Aline', email: 'a@x.test' }, country: { code: 'RW', name: 'Rwanda' }, plan: { name: 'Full Access', durationDays: 30 }, paidAt: '2026-11-01T10:00:00Z', accessStartsAt: '2026-11-01T10:00:00Z', accessEndsAt: '2026-12-01T10:00:00Z' },
      },
    }));
    renderReceipt();
    const list = await screen.findByLabelText('Receipt details');
    expect(list).toHaveTextContent('Receipt numberTX-1');
    expect(list).toHaveTextContent('Issued toAline (a@x.test)');
    expect(list).toHaveTextContent('PackageFull Access · 30 days');
    expect(screen.getByRole('button', { name: 'Print receipt' })).toBeInTheDocument();
  });

  it('a declined payment has no receipt and says it was not charged', async () => {
    mockFetch(() => ({ body: { payment: payment('DECLINED'), receipt: null } }));
    renderReceipt();
    expect(await screen.findByText('You were not charged.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Receipt details')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Print receipt' })).not.toBeInTheDocument();
  });
});
