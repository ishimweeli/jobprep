import { describe, expect, it } from 'vitest';
import type { DashboardResponse } from '../../api/types';
import {
  accessCardView, accessState, chartAria, chartPoints, DESKTOP_CHART, greeting, headline, longDate, PHONE_CHART, practiceLine, progressWidth, startHereLine, suggestedMeta,
  visibleSections, type AccessCardInput,
} from './dashboardModel';

describe('dashboard model', () => {
  it('greets in Kinyarwanda for Rwanda', () => {
    expect(greeting('RW', 'Aline')).toBe('Muraho, Aline');
    expect(greeting('KE', 'Aline')).toBe('Hello, Aline');
  });

  it('progress width is answered / total', () => {
    expect(progressWidth(18, 40)).toBe(45);
    expect(progressWidth(0, 0)).toBe(0);
  });

  it('chart points: evenly spread, 0 % on the baseline, higher scores higher up', () => {
    const pts = chartPoints([{ percent: 54, label: 'a' }, { percent: 62, label: 'b' }, { percent: 72, label: 'c' }], DESKTOP_CHART);
    expect(pts.map((p) => p.x)).toEqual([100, 310, 520]);
    expect(pts[0]!.y).toBeGreaterThan(pts[1]!.y);
    expect(pts[1]!.y).toBeGreaterThan(pts[2]!.y);
    expect(chartPoints([{ percent: 0, label: '' }], DESKTOP_CHART)[0]!.y).toBe(DESKTOP_CHART.baseline);
    expect(chartPoints([{ percent: 100, label: '' }], DESKTOP_CHART)[0]!.y).toBe(DESKTOP_CHART.top);
  });

  it('a single attempt sits in the middle; unscored attempts are skipped; the phone frame has its own width', () => {
    expect(chartPoints([{ percent: 50, label: '' }], PHONE_CHART)[0]!.x).toBe(170);
    expect(chartPoints([{ percent: null, label: '' }, { percent: 50, label: '' }], PHONE_CHART)).toHaveLength(1);
  });

  it('accessible name lists every score with its date', () => {
    const pts = chartPoints([{ percent: 54, label: '' }, { percent: 72.4, label: '' }], DESKTOP_CHART);
    expect(chartAria(pts, ['17 October', '1 November'])).toBe('Scores: 54 percent on 17 October, 72 percent on 1 November');
    expect(longDate('2026-10-17T09:00:00')).toBe('17 October');
  });

  it('shows only what the artboard can show for the data (empty dashboard is undesigned)', () => {
    const empty = {
      resume: null, recommended: null, scoreHistory: [], topics: { strong: [], needsWork: [] }, recentlyCompleted: [], access: { current: null, expired: null, otherCountries: [] },
    } as unknown as DashboardResponse;
    expect(visibleSections(empty)).toEqual({ resume: false, recommended: false, history: false, topics: false, recent: false, access: true });
    const full = {
      ...empty,
      resume: {}, recommended: {}, scoreHistory: [{ percent: 60 }], topics: { strong: [{}], needsWork: [] }, recentlyCompleted: [{}], access: { current: { endsAt: 'x', daysLeft: 3 }, otherCountries: [] },
    } as unknown as DashboardResponse;
    expect(Object.values(visibleSections(full)).every(Boolean)).toBe(true);
  });
});

type A = Pick<DashboardResponse, 'access' | 'pendingPayment'>;
const none: A = { access: { current: null, expired: null, otherCountries: [] }, pendingPayment: null };
const active = (daysLeft: number, endingSoon = false): A => ({ ...none, access: { current: { endsAt: '2026-11-24T10:00:00Z', daysLeft, endingSoon }, expired: null, otherCountries: [] } });
const expired: A = { ...none, access: { current: null, expired: { endedAt: '2026-10-24T10:00:00Z' }, otherCountries: [] } };
const pending: A = { ...none, pendingPayment: { id: 'p1', providerLabel: 'MTN MoMo', priceLabel: 'RWF 2,000', expiresAt: '2026-11-02T10:03:00Z' } };

describe('My access state (DashboardNew.dc)', () => {
  it('maps the API fields to the five states', () => {
    expect(accessState(none)).toBe('free');
    expect(accessState(pending)).toBe('pending');
    expect(accessState(active(23))).toBe('active');
    expect(accessState(active(2, true))).toBe('endingSoon');
    expect(accessState(expired)).toBe('expired');
  });
  it('a payment waiting for approval wins, even over running access', () => {
    expect(accessState({ ...active(10), pendingPayment: pending.pendingPayment })).toBe('pending');
  });

  const base = (d: A, extra: Partial<AccessCardInput> = {}): AccessCardInput => ({
    d, countryName: 'Rwanda', plan: { priceLabel: 'RWF 2,000', durationDays: 30, checkoutAvailable: true },
    formatDate: () => '24 Nov 2026', formatTime: () => '21:05', formatPhone: () => '+250 788 123 456', ...extra,
  });

  it('free only: price and days come from the plan, and there is a Get Full Access button', () => {
    const v = accessCardView(base(none));
    expect(v.badge).toEqual({ text: 'Free', tone: 'soft' });
    expect(v.title).toBe('You’re using free sample tests');
    expect(v.body).toBe('Full Access unlocks every mock test in Rwanda for 30 days, with one payment of RWF 2,000. Nothing renews.');
    expect(v.cta).toEqual({ label: 'Get Full Access', target: 'checkout' });
  });
  it('never prints a placeholder: no price leaves the payment clause out and no button when checkout is closed', () => {
    const v = accessCardView(base(none, { plan: { priceLabel: null, durationDays: 30, checkoutAvailable: false } }));
    expect(v.body).toBe('Full Access unlocks every mock test in Rwanda for 30 days. Nothing renews.');
    expect(v.body).not.toContain('[');
    expect(v.cta).toBeNull();
  });
  it('payment pending: provider, price, number and time from the API; no PIN wording; check + resend', () => {
    const v = accessCardView(base(pending, { pending: { msisdn: '+250788123456', createdAt: '2026-11-02T19:05:00Z' } }));
    expect(v.badge.text).toBe('Pending');
    expect(v.title).toBe('Waiting for your MTN MoMo approval');
    expect(v.body).toBe('We sent a prompt for RWF 2,000 to +250 788 123 456 at 21:05. Approve it on your phone. If you don’t, you won’t be charged.');
    expect(v.body).not.toMatch(/PIN/);
    expect(v.cta).toEqual({ label: 'Check payment', target: 'check' });
    expect(v.link).toEqual({ label: 'Send the prompt again', target: 'resend' });
  });
  it('payment pending without the payment details leaves the number and time out', () => {
    expect(accessCardView(base(pending)).body).toBe('We sent a prompt for RWF 2,000. Approve it on your phone. If you don’t, you won’t be charged.');
  });
  it('active: days left, end date, a bar of days left out of the plan, a link to browse', () => {
    const v = accessCardView(base(active(23)));
    expect(v.badge).toEqual({ text: 'Active', tone: 'green' });
    expect(v.title).toBe('Full Access · 23 days left');
    expect(v.body).toBe('Every mock test in Rwanda is unlocked until 24 Nov 2026.');
    expect(v.bar).toEqual({ percent: 77, amber: false });
    expect(v.cta).toBeNull();
    expect(v.link).toEqual({ label: 'Browse all mock tests', target: 'catalog' });
  });
  it('ending soon: amber, "Ends in 2 days", and "Add 30 more days"', () => {
    const v = accessCardView(base(active(2, true)));
    expect(v.badge).toEqual({ text: 'Ends in 2 days', tone: 'amber' });
    expect(v.title).toBe('Full Access ends on 24 Nov 2026');
    expect(v.bar).toEqual({ percent: 7, amber: true });
    expect(v.cta).toEqual({ label: 'Add 30 more days', target: 'checkout' });
    expect(accessCardView(base(active(1, true))).badge.text).toBe('Ends in 1 day');
    expect(accessCardView(base(active(0, true))).badge.text).toBe('Ends today');
  });
  it('expired: when it ended, results are kept, buy again', () => {
    const v = accessCardView(base(expired));
    expect(v.badge).toEqual({ text: 'Expired', tone: 'soft' });
    expect(v.title).toBe('Full Access ended on 24 Nov 2026');
    expect(v.body).toBe('Your results, scores and review notes are still here. Free sample tests stay open.');
    expect(v.cta).toEqual({ label: 'Get Full Access again', target: 'checkout' });
  });
  it('the bar never goes past full after renewals', () => {
    expect(accessCardView(base(active(60))).bar?.percent).toBe(100);
  });
});

describe('new user dashboard (DashboardNew.dc)', () => {
  const d = { hasActivity: false, country: { code: 'RW', name: 'Rwanda' }, user: { name: 'Aline Uwase', firstName: 'Aline' } };
  it('says Welcome until the first test is finished, then the usual greeting', () => {
    expect(headline(d)).toBe('Welcome, Aline');
    expect(headline({ ...d, hasActivity: true })).toBe('Muraho, Aline');
  });
  it('Start here line and suggested tests use the API numbers', () => {
    expect(startHereLine({ isFree: true, questionCount: 50, durationMinutes: 60 })).toBe('Free sample · 50 questions · 60 minutes');
    expect(suggestedMeta({ questionCount: 40, durationMinutes: 45 })).toBe('40 questions · 45 min');
  });
  it('the practice line has no minutes (practice is untimed)', () => {
    expect(practiceLine({ percent: 38, questionCount: 15 }, false)).toBe('Your weakest topic at 38% · 15 questions');
    expect(practiceLine({ percent: 38, questionCount: 15 }, true)).toBe('Your weakest topic at 38%. 15 questions, with explanations after each one.');
    expect(practiceLine({ percent: 38, questionCount: 15 }, false)).not.toMatch(/min/);
  });
});
