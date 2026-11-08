import { describe, expect, it } from 'vitest';
import { parseEvents } from '../../api/client';
import { checkoutCopy, checkoutHeading, minutesLabel } from '../checkout/checkoutModel';
import type { CheckoutSummary } from '../../api/types';
import {
  balanceCaption, clock, defaultDuration, durationLabel, durationOptions, endReasonText, micErrorMessage, scoreTone, signedPercent, takeSentences, usedPercent,
} from './interviewModel';

const wallet = (over: object = {}) => ({ remainingSeconds: 15600, totalSeconds: 18000, usedSeconds: 2400, hasPackage: true, packageExpiresAt: null, trialRemainingSeconds: 0, ...over });

describe('interview model', () => {
  it('formats durations like the dashboard ("4h 20m")', () => {
    expect([15600, 18000, 2100, 45, 0].map(durationLabel)).toEqual(['4h 20m', '5h', '35m', '45s', '0s']);
    expect(clock(125)).toBe('02:05');
  });

  it('describes the balance', () => {
    expect(balanceCaption(wallet())).toBe('remaining of 5 hours');
    expect(balanceCaption(wallet({ hasPackage: false, trialRemainingSeconds: 300, totalSeconds: 300 }))).toBe('of free trial time left');
    expect(usedPercent(wallet())).toBe(13);
    expect(usedPercent(wallet({ totalSeconds: 0 }))).toBe(0);
  });

  it('offers lengths that fit the balance; a trial offers 5 and 10 minutes', () => {
    expect(durationOptions(300)).toEqual([{ minutes: 5, enough: true }, { minutes: 10, enough: false }]);
    expect(durationOptions(2000).map((o) => [o.minutes, o.enough])).toEqual([[15, true], [30, true], [45, false], [60, false]]);
    expect(defaultDuration(30, 18000)).toBe(30);
    expect(defaultDuration(60, 2000)).toBe(30);
    expect(defaultDuration(30, 300)).toBe(5);
  });

  it('scores, signs and reasons', () => {
    expect([null, 80, 60, 30].map(scoreTone)).toEqual(['none', 'good', 'mid', 'low']);
    expect([12, -4, 0].map(signedPercent)).toEqual(['+12%', '−4%', '0%']);
    expect(endReasonText('disconnected')).toContain('not charged');
    expect(endReasonText('completed')).toBeNull();
    expect(micErrorMessage(new DOMException('x', 'NotAllowedError'))).toContain('blocked');
  });

  it('speaks finished sentences as they stream in and keeps the rest', () => {
    expect(takeSentences('Welcome. Could you introduce yourself? I am')).toEqual({ sentences: ['Welcome.', 'Could you introduce yourself?'], rest: 'I am' });
    expect(takeSentences('No end yet')).toEqual({ sentences: [], rest: 'No end yet' });
  });
});

describe('server-sent events', () => {
  it('parses complete frames and keeps an unfinished one', () => {
    const { events, rest } = parseEvents('event: transcript\ndata: {"text":"hi"}\n\nevent: delta\ndata: {"text":"Wel"}\n\nevent: del');
    expect(events).toEqual([{ event: 'transcript', data: { text: 'hi' } }, { event: 'delta', data: { text: 'Wel' } }]);
    expect(rest).toBe('event: del');
  });
});

describe('checkout copy for the interview tier', () => {
  const base: CheckoutSummary = {
    country: { code: 'RW', name: 'Rwanda', dialCode: '+250', currencyCode: 'RWF' },
    currentAccess: null, newAccessEndsAt: null, paymentMethods: [], prefillPhone: null,
    plan: { code: 'interview', name: 'Full Access + Interview prep', priceMinor: 3000, priceLabel: 'RWF 3,000', durationDays: 30, paidOnce: true, checkoutAvailable: true, interviewMinutes: 300, kind: 'PURCHASE' },
  };
  it('names the tier and the hours, and explains an upgrade', () => {
    expect(minutesLabel(300)).toBe('5 hours');
    expect(minutesLabel(90)).toBe('90 minutes');
    expect(checkoutHeading(base)).toBe('Get interview prep');
    expect(checkoutCopy(base, '8 Dec 2026').summaryLine).toBe('Every mock test and 5 hours of AI interview practice · 30 days');
    const up = { ...base, plan: { ...base.plan!, kind: 'UPGRADE' as const, priceLabel: 'RWF 2,050' } };
    expect(checkoutHeading(up)).toBe('Add interview prep');
    expect(checkoutCopy(up, '20 Nov 2026').note).toContain('pay only the difference');
    expect(checkoutHeading({ plan: { ...base.plan!, code: 'full_access' } })).toBe('Get Full Access');
  });
});
