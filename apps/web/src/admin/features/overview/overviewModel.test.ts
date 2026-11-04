import { describe, expect, it } from 'vitest';
import type { Overview } from '../../api/types';
import { buildAlerts, buildKpis } from './overviewModel';

const o: Overview = {
  asOf: '2026-11-01T19:30:00Z',
  scope: null,
  kpis: {
    registeredUsers: 4218, newUsersToday: 131, fullAccessActive: 612, paymentsToday: 39,
    revenueThisMonth: [{ currencyCode: 'RWF', amountMinor: 78000, payments: 39, label: 'RWF 78,000' }],
    testsStartedToday: 1386, testsCompletedPercentToday: 82,
  },
  needsAttention: {
    stuckPayments: { count: 3, thresholdMinutes: 10, oldestMinutes: 24, oldestProvider: 'MTN_MOMO' },
    reportedQuestions: { count: 4, top: { mockTestTitle: 'Secondary Mathematics Mock 1', questionNumber: 31, reports: 2 } },
    examRequests: [{ label: 'Veterinary officer', n: 7 }],
  },
  chart: { days: [], signups: [], payments: [] }, topMockTests: [], latestPayments: [],
};

describe('Overview KPIs', () => {
  it('desktop copy and numbers', () => {
    expect(buildKpis(o, false)).toEqual([
      { label: 'Registered users', value: '4,218', delta: '+131 today', good: true },
      { label: 'Full Access active now', value: '612', delta: '39 new today', good: true },
      { label: 'Revenue this month', value: 'RWF 78,000', delta: '39 payments · 1 Nov', good: false },
      { label: 'Mock tests taken today', value: '1,386', delta: '82% completed', good: false },
    ]);
  });
  it('phone copy is shorter', () => {
    const k = buildKpis(o, true);
    expect(k[1]!.label).toBe('Full Access active');
    expect(k[2]!.delta).toBe('39 payments');
    expect(k[3]!.label).toBe('Tests taken today');
  });
  it('no tests started today has no completion line', () => {
    expect(buildKpis({ ...o, kpis: { ...o.kpis, testsStartedToday: 0, testsCompletedPercentToday: null } }, false)[3]!.delta).toBe('');
  });
});

describe('Needs attention', () => {
  it('stuck payments link to Payments filtered stuck, with the real threshold', () => {
    const [a] = buildAlerts(o, false);
    expect(a).toMatchObject({ title: '3 payments pending over 10 minutes', meta: 'MTN MoMo · oldest 24 min ago', action: 'Review', to: '/admin/payments?stuck=true' });
  });
  it('reported questions go to the reports queue', () => {
    expect(buildAlerts(o, false)[1]).toMatchObject({ title: '4 questions reported by candidates', meta: 'Secondary Mathematics Mock 1 · Q31 reported twice', to: '/admin/exams/reports' });
  });
  it('the top exam request is shown; the "support requests" row has no data and is not there', () => {
    const list = buildAlerts(o, false);
    expect(list).toHaveLength(3);
    expect(list[2]).toMatchObject({ title: '“Veterinary officer” requested 7 times', action: 'Plan exam', to: '/admin/exams/requests?q=Veterinary%20officer' });
    expect(list.map((x) => x.title).join(' ')).not.toMatch(/support/i);
  });
  it('rows with nothing to report are left out', () => {
    expect(buildAlerts({ ...o, needsAttention: { stuckPayments: { count: 0, thresholdMinutes: 10, oldestMinutes: null, oldestProvider: null }, reportedQuestions: { count: 0, top: null }, examRequests: [] } }, false)).toEqual([]);
  });
  it('phone wording', () => {
    expect(buildAlerts(o, true).map((a) => a.title)).toEqual(['3 payments pending over 10 min', '4 questions reported', '“Veterinary officer” requested 7×']);
  });
});
