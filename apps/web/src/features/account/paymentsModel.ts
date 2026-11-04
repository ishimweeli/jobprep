import type { PaymentRow, PaymentStatus, Receipt } from '../../api/types';

/** Payment history and receipt wording (C21; not drawn, built in the existing card style). Pure, unit-tested. */

export type StatusTone = 'good' | 'wait' | 'bad';

const LABEL: Record<PaymentStatus, { label: string; tone: StatusTone }> = {
  SUCCESSFUL: { label: 'Paid', tone: 'good' },
  PENDING: { label: 'Waiting for approval', tone: 'wait' },
  DECLINED: { label: 'Declined', tone: 'bad' },
  FAILED: { label: 'Not completed', tone: 'bad' },
  EXPIRED: { label: 'Expired', tone: 'bad' },
};

export const statusLabel = (s: PaymentStatus) => LABEL[s].label;
export const statusTone = (s: PaymentStatus): StatusTone => LABEL[s].tone;

/** "You were not charged." on every ending that is not a success and not still waiting. */
export const notChargedLine = (s: PaymentStatus): string | null => (s === 'DECLINED' || s === 'FAILED' || s === 'EXPIRED' ? 'You were not charged.' : null);

/** The grey detail line of a history row: provider, transaction id, access until (only the parts that exist). */
export function rowDetail(row: Pick<PaymentRow, 'providerLabel' | 'transactionId' | 'accessUntil'>, formatDate: (iso: string) => string): string {
  return [row.providerLabel, row.transactionId ? `ID ${row.transactionId}` : null, row.accessUntil ? `Access until ${formatDate(row.accessUntil)}` : null].filter(Boolean).join(' · ');
}

/** The "Check payment" result sentence, from the status the operator answered. */
export function checkResultLine(status: PaymentStatus): string {
  switch (status) {
    case 'SUCCESSFUL':
      return 'Payment confirmed. Full Access is active.';
    case 'PENDING':
      return 'Still waiting for approval. Approve the request on your phone, then check again.';
    case 'DECLINED':
      return 'The payment was declined. You were not charged.';
    case 'EXPIRED':
      return 'The payment request expired. You were not charged.';
    default:
      return 'The payment could not be completed. You were not charged.';
  }
}

/** The rows of the receipt, in order, skipping anything the API left empty. */
export function receiptRows(r: Receipt, priceLabel: string, providerLabel: string, formatDate: (iso: string) => string): [string, string][] {
  const rows: [string, string | null][] = [
    ['Receipt number', r.number],
    ['Issued to', `${r.issuedTo.name} (${r.issuedTo.email})`],
    ['Package', `${r.plan.name} · ${r.plan.durationDays} days`],
    ['Country', r.country.name],
    ['Amount', priceLabel],
    ['Paid with', providerLabel],
    ['Paid on', r.paidAt ? formatDate(r.paidAt) : null],
    ['Access from', r.accessStartsAt ? formatDate(r.accessStartsAt) : null],
    ['Access until', r.accessEndsAt ? formatDate(r.accessEndsAt) : null],
  ];
  return rows.filter((x): x is [string, string] => x[1] !== null);
}
