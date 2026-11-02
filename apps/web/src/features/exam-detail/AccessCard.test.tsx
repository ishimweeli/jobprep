import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ExamDetail } from '../../api/types';
import { AccessCard, accessView } from './AccessCard';

const base: ExamDetail = {
  id: '1',
  slug: 'accountant-mock-1',
  title: 'Accountant — Mock 1',
  category: { slug: 'accounting-finance', name: 'Accounting & finance' },
  profession: 'Accountant',
  questionCount: 12,
  durationMinutes: 30,
  languages: ['en'],
  difficulty: 'STANDARD',
  isFree: false,
  accessTag: 'FULL_ACCESS',
  attempts: 'UNLIMITED',
  publishedAt: null,
  summary: null,
  totalMarks: 12,
  sections: [],
  instructions: [],
  negativeMarking: null,
  passMark: null,
  noOfficialPassMark: true,
  access: { state: 'LOCKED', canStart: false, requiresAccount: false, needsFullAccess: true, accessEndsAt: null, daysLeft: null },
  pricing: { priceLabel: 'KES 1,234', durationDays: 45, checkoutAvailable: true, paymentMethods: ['M-Pesa'] },
  freeSample: { slug: 'accountant-free-sample', title: 'Accountant — Free Sample', questionCount: 6 },
  previousAttempts: [],
  inProgress: null,
};

const renderCard = (exam: ExamDetail) =>
  render(
    <MemoryRouter>
      <AccessCard view={accessView(exam, 'ke')} />
    </MemoryRouter>,
  );

describe('exam access card', () => {
  it('locked test: price, currency and duration come only from the API', () => {
    const view = accessView(base, 'ke');
    expect(view.getFullAccessLabel).toBe('Get Full Access · KES 1,234');
    expect(view.checkoutPath).toBe('/ke/checkout');
    expect(view.samplePath).toBe('/ke/tests/accountant-free-sample/start');
    renderCard(base);
    expect(screen.getByRole('link', { name: 'Get Full Access · KES 1,234' })).toBeInTheDocument();
    expect(screen.getByText('Full Access · 45 days')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Try the free 6-question sample' })).toBeInTheDocument();
    expect(screen.getByText('Pay with M-Pesa')).toBeInTheDocument();
    expect(screen.queryByText(/RWF/)).not.toBeInTheDocument();
  });

  it('actions are real links now that checkout and the exam exist; checkout remembers the test', () => {
    renderCard(base);
    expect(screen.getByRole('link', { name: /Get Full Access/ })).toHaveAttribute('href', '/ke/checkout?test=accountant-mock-1');
    expect(screen.getByRole('link', { name: /free 6-question sample/ })).toHaveAttribute('href', '/ke/tests/accountant-free-sample/start');
  });

  it('locked test with no price set offers no purchase button', () => {
    renderCard({ ...base, pricing: { priceLabel: null, durationDays: null, checkoutAvailable: false, paymentMethods: [] } });
    expect(screen.queryByRole('link', { name: /Get Full Access/ })).not.toBeInTheDocument();
  });

  it('free test: Start Mock Test, no account needed', () => {
    const exam = { ...base, isFree: true, access: { ...base.access, state: 'FREE' as const, canStart: true, needsFullAccess: false }, pricing: null };
    expect(accessView(exam, 'ke').startPath).toBe('/ke/tests/accountant-mock-1/start');
    renderCard(exam);
    expect(screen.getByRole('link', { name: 'Start Mock Test' })).toBeInTheDocument();
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText(/No account needed/)).toBeInTheDocument();
  });

  it('granted test shows days left from the API', () => {
    renderCard({ ...base, access: { ...base.access, state: 'GRANTED', canStart: true, needsFullAccess: false, daysLeft: 23 }, pricing: null });
    expect(screen.getByRole('link', { name: 'Start Mock Test' })).toBeInTheDocument();
    expect(screen.getByText('Unlocked · 23 days left')).toBeInTheDocument();
  });
});
