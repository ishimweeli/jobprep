import type { PaymentDetail, PaymentStatus } from '../../api/types';
import { formatDateTime, providerName } from '../../lib/format';

/** Plain-data parts of the payments screens: what a check found, the timeline of one payment, who may be granted by hand. */

export type CheckTone = 'good' | 'wait' | 'bad';
export interface CheckOutcome { key: 'pending' | 'paid' | 'declined' | 'expired' | 'failed'; title: string; text: string; tone: CheckTone }

/**
 * What "Check status" found, in the four words the operator can answer (A4): still pending, approved (now paid),
 * declined, expired. Anything else that failed reads as failed.
 */
export function checkOutcome(before: PaymentStatus, after: PaymentStatus): CheckOutcome {
  switch (after) {
    case 'SUCCESSFUL':
      return before === 'SUCCESSFUL'
        ? { key: 'paid', tone: 'good', title: 'Already paid', text: 'The operator confirms this payment. Access is already granted.' }
        : { key: 'paid', tone: 'good', title: 'Approved: now paid', text: 'The operator approved the payment. Full Access has been granted to the candidate.' };
    case 'PENDING':
      return { key: 'pending', tone: 'wait', title: 'Still pending', text: 'The operator has not answered yet. The candidate may still approve it on their phone. Check again in a minute.' };
    case 'DECLINED':
      return { key: 'declined', tone: 'bad', title: 'Declined', text: 'The payer declined the request on their phone. They were not charged and no access was granted.' };
    case 'EXPIRED':
      return { key: 'expired', tone: 'bad', title: 'Expired', text: 'The payment request ran out of time without an answer. They were not charged. If the money did leave the account, grant access by hand with the transaction ID.' };
    default:
      return { key: 'failed', tone: 'bad', title: 'Failed', text: 'The operator could not complete the payment. They were not charged and no access was granted.' };
  }
}

/** The short line under a row after a check (kept for the phone cards and the table's note). */
export function checkResultText(before: PaymentStatus, after: PaymentStatus): string {
  if (after === 'PENDING') return 'Still pending';
  if (after === 'SUCCESSFUL') return 'Now paid';
  return before === after ? 'Failed' : 'Now failed';
}

export interface TimelineItem { key: string; at: string; title: string; detail?: string; tone: 'neutral' | 'good' | 'bad' | 'wait' }

const SIGNAL: Record<string, { title: string; tone: TimelineItem['tone'] }> = {
  provider_success: { title: 'The operator confirmed the payment', tone: 'good' },
  provider_declined: { title: 'The payer declined the request', tone: 'bad' },
  provider_failed: { title: 'The operator reported a failure', tone: 'bad' },
  provider_pending: { title: 'The operator says it is still pending', tone: 'wait' },
  timeout: { title: 'The request time ran out', tone: 'bad' },
  admin_confirm: { title: 'An admin confirmed the payment by hand', tone: 'good' },
};

const SOURCE: Record<string, string> = { webhook: 'callback from the operator', poll: 'status check', timeout: 'timer', admin: 'admin action' };

const sentence = (s: string) => {
  const t = s.replace(/[._]/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Unknown event';
};

/**
 * The event timeline of one payment (A4): the request sent, then every callback, poll, timer and manual action in
 * time order, then the access grant. Unknown event words degrade to plain text.
 */
export function buildTimeline(d: PaymentDetail): TimelineItem[] {
  const p = d.payment;
  const items: TimelineItem[] = [
    { key: 'request', at: p.createdAt, title: `Payment request sent to ${providerName(p.provider)}`, detail: `${p.priceLabel ?? 'Amount not set'} · the payer approves on their own phone`, tone: 'neutral' },
  ];
  for (const e of [...d.events].sort((a, b) => a.at.localeCompare(b.at))) {
    const known = SIGNAL[e.status];
    const via = SOURCE[e.source];
    items.push({
      key: e.id,
      at: e.at,
      title: known?.title ?? sentence(e.status),
      detail: via ? `Source: ${via}` : e.source ? `Source: ${sentence(e.source).toLowerCase()}` : undefined,
      tone: known?.tone ?? 'neutral',
    });
  }
  if (d.grant) {
    const by = d.grant.source === 'MANUAL' ? `Granted by hand${d.grant.grantedBy ? ` by ${d.grant.grantedBy}` : ''}` : 'Full Access granted';
    items.push({
      key: `grant-${d.grant.id}`,
      at: d.grant.startsAt,
      title: by,
      detail: `Access until ${formatDateTime(d.grant.endsAt)}${d.grant.reason ? ` · reason: ${d.grant.reason}` : ''}`,
      tone: 'good',
    });
  }
  return items;
}

/** Minutes since the request, written for people: "9 min", "2 h 5 min", "1 day". */
export function ageText(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || minutes < 0) return '—';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 24) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.floor(minutes / (60 * 24));
  return `${d} ${d === 1 ? 'day' : 'days'}`;
}

/** What a manual grant dialog shows about the payment, from a list row or from the detail. */
export interface GrantTarget { id: string; candidate: string; priceLabel: string; providerLabel: string; msisdn: string; ageMinutes: number | null }

export const MIN_TRANSACTION_ID = 4;
export const transactionIdProblem = (id: string): string | null => {
  const t = id.trim();
  if (!t) return 'Enter the provider transaction ID.';
  if (t.length < MIN_TRANSACTION_ID) return `The transaction ID has at least ${MIN_TRANSACTION_ID} characters.`;
  if (t.length > 80) return 'The transaction ID has at most 80 characters.';
  return null;
};

/** Words for what the manual grant, the check and the export can refuse. */
export const PAYMENT_ERRORS: Record<string, string> = {
  already_paid: 'This payment is already paid. Nothing to grant.',
  payment_declined: 'The payer declined this payment, so access cannot be granted for it.',
  transaction_id_in_use: 'That transaction ID was already used for another payment. One operator transaction can only pay once.',
  payment_not_eligible: 'This payment cannot be granted by hand in its current state. Reload the page and look at its status.',
  invalid_range: 'The end date is before the start date.',
  payment_not_found: 'This payment no longer exists.',
};

/** True when a payment may be granted by hand and the API has not said otherwise. */
export function canGrantByHand(status: PaymentStatus, stuck: boolean, apiSays?: boolean): boolean {
  if (apiSays !== undefined) return apiSays;
  return stuck || status === 'EXPIRED' || status === 'FAILED';
}
