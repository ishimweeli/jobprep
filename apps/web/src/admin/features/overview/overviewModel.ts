import type { Overview } from '../../api/types';
import { formatCount, formatDay, formatTotals, plural, providerName } from '../../lib/format';

/** The Overview's cards as plain data (AdminOverview.dc, AdminOverviewPhone.dc): copy from the artboards, numbers from the API. */

export interface Kpi { label: string; value: string; delta: string; good: boolean }

export function buildKpis(o: Overview, phone: boolean): Kpi[] {
  const k = o.kpis;
  const payments = k.revenueThisMonth.reduce((n, r) => n + r.payments, 0);
  return [
    { label: 'Registered users', value: formatCount(k.registeredUsers), delta: `+${formatCount(k.newUsersToday)} today`, good: true },
    { label: phone ? 'Full Access active' : 'Full Access active now', value: formatCount(k.fullAccessActive), delta: `${formatCount(k.paymentsToday)} new today`, good: true },
    {
      label: 'Revenue this month',
      value: formatTotals(k.revenueThisMonth),
      delta: phone ? plural(payments, 'payment') : `${plural(payments, 'payment')} · ${formatDay(o.asOf)}`,
      good: false,
    },
    {
      label: phone ? 'Tests taken today' : 'Mock tests taken today',
      value: formatCount(k.testsStartedToday),
      delta: k.testsCompletedPercentToday === null ? '' : `${k.testsCompletedPercentToday}% completed`,
      good: false,
    },
  ];
}

export interface Alert { key: string; title: string; meta: string; action: string; to: string; dot: string }

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/**
 * "Needs attention": stuck payments, reported questions, the top exam request. The artboard's "support requests"
 * row has no data source in the API, so it is not here.
 */
export function buildAlerts(o: Overview, phone: boolean): Alert[] {
  const a = o.needsAttention;
  const out: Alert[] = [];
  const stuck = a.stuckPayments;
  if (stuck.count > 0) {
    const where = stuck.oldestProvider ? `${providerName(stuck.oldestProvider)} · ` : '';
    out.push({
      key: 'stuck',
      title: phone
        ? `${stuck.count} ${stuck.count === 1 ? 'payment' : 'payments'} pending over ${stuck.thresholdMinutes} min`
        : `${stuck.count} ${stuck.count === 1 ? 'payment' : 'payments'} pending over ${stuck.thresholdMinutes} minutes`,
      meta: stuck.oldestMinutes === null ? '' : phone ? `Oldest ${stuck.oldestMinutes} min ago` : `${where}oldest ${stuck.oldestMinutes} min ago`,
      action: 'Review',
      to: '/admin/payments?stuck=true',
      dot: '#8A5300',
    });
  }
  const rep = a.reportedQuestions;
  if (rep.count > 0) {
    out.push({
      key: 'reports',
      title: phone ? `${rep.count} ${rep.count === 1 ? 'question' : 'questions'} reported` : `${rep.count} ${rep.count === 1 ? 'question' : 'questions'} reported by candidates`,
      meta: rep.top ? `${rep.top.mockTestTitle} · Q${rep.top.questionNumber} reported ${times(rep.top.reports)}` : '',
      action: 'Open',
      to: '/admin/exams',
      dot: '#8A5300',
    });
  }
  const top = a.examRequests[0];
  if (top) {
    out.push({
      key: 'requests',
      title: phone ? `“${top.label}” requested ${top.n}×` : `“${top.label}” requested ${top.n} ${top.n === 1 ? 'time' : 'times'}`,
      meta: phone ? 'No mock test yet' : 'No mock test exists for this search yet',
      action: 'Plan exam',
      to: '/admin/exams',
      dot: '#164A7A',
    });
  }
  return out;
}

export const optionLabel = (name: string, status: string) => (status === 'LIVE' ? name : `${name} (${status.toLowerCase()})`);
