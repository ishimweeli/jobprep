import { describe, expect, it } from 'vitest';
import type { PaymentDetail } from '../../api/types';
import { ageText, buildTimeline, canGrantByHand, checkOutcome, checkResultText, transactionIdProblem } from './paymentsModel';

const detail = (over: Partial<PaymentDetail> = {}): PaymentDetail => ({
  payment: {
    id: 'p1', status: 'PENDING', provider: 'MTN_MOMO', msisdn: '+250789123456', createdAt: '2026-11-01T10:00:00Z', expiresAt: '2026-11-01T10:03:00Z', confirmedAt: null,
    priceLabel: 'RWF 2,000', reference: 'MP1', transactionId: null, failureReason: null, countryCode: 'RW',
  },
  user: { id: 'u1', name: 'Aline Uwase', email: 'aline@example.com' },
  events: [],
  grant: null,
  ...over,
});

describe('what a check found', () => {
  it('has the four outcomes the operator can answer, in words', () => {
    expect(checkOutcome('PENDING', 'PENDING')).toMatchObject({ key: 'pending', title: 'Still pending', tone: 'wait' });
    expect(checkOutcome('PENDING', 'SUCCESSFUL')).toMatchObject({ key: 'paid', title: 'Approved: now paid', tone: 'good' });
    expect(checkOutcome('PENDING', 'DECLINED')).toMatchObject({ key: 'declined', title: 'Declined', tone: 'bad' });
    expect(checkOutcome('PENDING', 'EXPIRED')).toMatchObject({ key: 'expired', title: 'Expired', tone: 'bad' });
    expect(checkOutcome('PENDING', 'FAILED')).toMatchObject({ key: 'failed', title: 'Failed' });
  });

  it('every non-success ending says they were not charged', () => {
    for (const s of ['DECLINED', 'FAILED'] as const) expect(checkOutcome('PENDING', s).text).toMatch(/not charged/);
    expect(checkOutcome('PENDING', 'EXPIRED').text).toMatch(/not charged/);
  });

  it('keeps the short row note', () => {
    expect(checkResultText('PENDING', 'PENDING')).toBe('Still pending');
    expect(checkResultText('PENDING', 'SUCCESSFUL')).toBe('Now paid');
    expect(checkResultText('PENDING', 'DECLINED')).toBe('Now failed');
  });
});

describe('the payment timeline', () => {
  it('starts with the request, then events in time order, then the grant', () => {
    const t = buildTimeline(detail({
      events: [
        { id: 'e2', source: 'webhook', status: 'provider_success', at: '2026-11-01T10:05:00Z' },
        { id: 'e1', source: 'poll', status: 'provider_pending', at: '2026-11-01T10:01:00Z' },
      ],
      grant: { id: 'g1', source: 'PAYMENT', startsAt: '2026-11-01T10:05:00Z', endsAt: '2026-12-01T10:05:00Z', grantedBy: null, reason: null },
    }));
    expect(t.map((x) => x.title)).toEqual([
      'Payment request sent to MTN MoMo',
      'The operator says it is still pending',
      'The operator confirmed the payment',
      'Full Access granted',
    ]);
    expect(t[1]!.detail).toBe('Source: status check');
    expect(t[2]!.detail).toBe('Source: callback from the operator');
    expect(t[2]!.tone).toBe('good');
    expect(t[3]!.detail).toMatch(/^Access until 1 Dec, /);
  });

  it('a manual grant names who did it and why', () => {
    const t = buildTimeline(detail({ grant: { id: 'g1', source: 'MANUAL', startsAt: '2026-11-01T10:05:00Z', endsAt: '2026-12-01T10:05:00Z', grantedBy: 'Jean Bosco N.', reason: 'SMS seen' } }));
    expect(t.at(-1)!.title).toBe('Granted by hand by Jean Bosco N.');
    expect(t.at(-1)!.detail).toContain('reason: SMS seen');
  });

  it('unknown event words degrade to plain text', () => {
    const t = buildTimeline(detail({ events: [{ id: 'e', source: 'carrier_pigeon', status: 'something_new', at: '2026-11-01T10:01:00Z' }] }));
    expect(t[1]!.title).toBe('Something new');
    expect(t[1]!.detail).toBe('Source: carrier pigeon');
  });
});

describe('small helpers', () => {
  it('writes ages for people', () => {
    expect(ageText(9)).toBe('9 min');
    expect(ageText(125)).toBe('2 h 5 min');
    expect(ageText(120)).toBe('2 h');
    expect(ageText(60 * 48)).toBe('2 days');
    expect(ageText(null)).toBe('—');
  });

  it('checks the transaction id (4 to 80 characters)', () => {
    expect(transactionIdProblem('')).toMatch(/Enter/);
    expect(transactionIdProblem('abc')).toMatch(/at least 4/);
    expect(transactionIdProblem('MP261025.1840')).toBeNull();
    expect(transactionIdProblem('x'.repeat(81))).toMatch(/at most 80/);
  });

  it('may grant by hand when stuck, expired or failed, unless the API says otherwise', () => {
    expect(canGrantByHand('PENDING', true)).toBe(true);
    expect(canGrantByHand('PENDING', false)).toBe(false);
    expect(canGrantByHand('EXPIRED', false)).toBe(true);
    expect(canGrantByHand('DECLINED', false)).toBe(false);
    expect(canGrantByHand('PENDING', true, false)).toBe(false);
  });
});
