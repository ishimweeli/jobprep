import type { AccessState, CountryStatus, PaymentRow, PaymentStatus, ProviderMode, TestStatus, UserDetail } from '../api/types';
import { formatDay, formatDayYear, formatTime, plural } from './format';

/** Pill colours and words from the artboards. `bg` / `ink` are the artboard's hex values. */
export interface Tone { label: string; bg: string; ink: string }

export const ACCESS_TONE: Record<AccessState, Tone> = {
  active: { label: 'Full Access', bg: '#EDE9FE', ink: '#5B21B6' },
  free: { label: 'Free', bg: '#F4F4F5', ink: '#3F3F46' },
  expired: { label: 'Expired', bg: '#FEF3C7', ink: '#92400E' },
  suspended: { label: 'Suspended', bg: '#FEE2E2', ink: '#991B1B' },
};

const PAID: Tone = { label: 'Paid', bg: '#D1FAE5', ink: '#065F46' };
const PENDING: Tone = { label: 'Pending', bg: '#FEF3C7', ink: '#92400E' };
const FAILED: Tone = { label: 'Failed', bg: '#FEE2E2', ink: '#991B1B' };

/** Declined, failed and expired all read "Failed" (the artboard has three words: Paid, Pending, Failed). */
export function paymentTone(status: PaymentStatus): Tone {
  if (status === 'SUCCESSFUL') return PAID;
  if (status === 'PENDING') return PENDING;
  return FAILED;
}

export const TEST_TONE: Record<TestStatus, Tone> = {
  PUBLISHED: { label: 'Published', bg: '#D1FAE5', ink: '#065F46' },
  DRAFT: { label: 'Draft', bg: '#F4F4F5', ink: '#3F3F46' },
  ARCHIVED: { label: 'Archived', bg: '#F4F4F5', ink: '#3F3F46' },
};

export const COUNTRY_TONE: Record<CountryStatus, Tone> = {
  LIVE: { label: 'Live', bg: '#D1FAE5', ink: '#065F46' },
  PREPARING: { label: 'Preparing', bg: '#FEF3C7', ink: '#92400E' },
  PLANNED: { label: 'Planned', bg: '#F4F4F5', ink: '#3F3F46' },
};

export const MODE_TONE: Record<ProviderMode, Tone> = {
  LIVE: { label: 'Live', bg: '#D1FAE5', ink: '#065F46' },
  SANDBOX: { label: 'Sandbox', bg: '#FEF3C7', ink: '#92400E' },
  DISABLED: { label: 'Off', bg: '#F4F4F5', ink: '#3F3F46' },
};

export const ACCESS_TAG = {
  free: { label: 'Free', bg: '#D1FAE5', ink: '#065F46' },
  paid: { label: 'Full Access', bg: '#EDE9FE', ink: '#5B21B6' },
} as const;

/** The provider's mode word as the artboard writes it next to a payment method ("live", "sandbox", "not connected"). */
export const modeWord = (mode: ProviderMode): string => (mode === 'DISABLED' ? 'not connected' : mode.toLowerCase());

export const PROVIDER_SWATCH: Record<string, string> = { MTN_MOMO: '#FFCB05', AIRTEL_MONEY: '#E40000', MPESA: '#00A650' };

/**
 * The small grey line under a payment's status badge, from the data only:
 * paid -> "Access until 1 Dec"; pending -> "Waiting 9 min"; failed -> why ("Declined by user", "Request expired").
 * `phone` gives the lower-case wording of the phone card ("access until 1 Dec").
 */
export function paymentNote(p: Pick<PaymentRow, 'status' | 'accessUntil' | 'waitingMinutes' | 'failureReason'>, phone = false): string {
  const cap = (s: string) => (phone ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  switch (p.status) {
    case 'SUCCESSFUL':
      return p.accessUntil ? cap(`Access until ${formatDay(p.accessUntil)}`) : '';
    case 'PENDING':
      return cap(`Waiting ${p.waitingMinutes ?? 0} min`);
    case 'DECLINED':
      return cap('Declined by user');
    case 'EXPIRED':
      return cap('Request expired');
    default: {
      const why = (p.failureReason ?? '').replace(/_/g, ' ').trim();
      return cap(why && why !== 'failed' ? why.charAt(0).toUpperCase() + why.slice(1) : 'Payment failed');
    }
  }
}

/** The ACCESS box of a user: its headline and the line under it. */
export function accessSummary(d: Pick<UserDetail, 'access' | 'user' | 'adminHistory'>): { line: string; meta: string } {
  const tone = ACCESS_TONE[d.access.state];
  switch (d.access.state) {
    case 'active':
      return { line: tone.label, meta: `${plural(d.access.daysLeft ?? 0, 'day')} left${d.access.endsAt ? ` · until ${formatDayYear(d.access.endsAt)}` : ''}` };
    case 'expired':
      return { line: tone.label, meta: d.access.expiredAt ? `Expired ${formatDayYear(d.access.expiredAt)}` : '' };
    case 'suspended': {
      const when = d.adminHistory.find((h) => h.action === 'user.suspend')?.at;
      const parts = [when ? `Suspended ${formatDay(when)}` : 'Suspended', d.user.suspendedReason].filter(Boolean);
      return { line: tone.label, meta: parts.join(' · ') };
    }
    default:
      if (d.access.pendingPaymentSince) return { line: tone.label, meta: `Payment pending since ${formatTime(d.access.pendingPaymentSince)}` };
      return { line: tone.label, meta: d.access.lastPaymentFailed ? 'Last payment failed' : '' };
  }
}

/** One admin-history sentence as the phone artboard writes it: "Sandrine K. sent a login code · 1 Nov, 11:02". */
export function historySentence(h: { action: string; actor: string | null; reason: string | null }): string {
  const what: Record<string, string> = {
    'otp.resend': 'sent a login code',
    'access.grant': 'granted Full Access',
    'user.suspend': 'suspended the account',
    'user.unsuspend': 'lifted the suspension',
  };
  const text = what[h.action] ?? h.action.replace(/[._]/g, ' ');
  return `${h.actor ?? 'System'} ${text}${h.reason ? ` — reason: ${h.reason}` : ''}`;
}
