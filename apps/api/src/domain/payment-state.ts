export type PaymentStatusCode = 'PENDING' | 'SUCCESSFUL' | 'DECLINED' | 'FAILED' | 'EXPIRED';

const TERMINAL: PaymentStatusCode[] = ['SUCCESSFUL', 'DECLINED', 'FAILED', 'EXPIRED'];

export function isTerminal(s: PaymentStatusCode): boolean {
  return TERMINAL.includes(s);
}

export type PaymentSignal =
  | { type: 'provider_success' }
  | { type: 'provider_declined' }
  | { type: 'provider_failed'; reason?: string }
  | { type: 'timeout' };

export interface Transition {
  next: PaymentStatusCode;
  /** True only when this signal moved the payment to SUCCESSFUL for the first time → grant access + send receipt. */
  grantAccess: boolean;
  /** True when the signal changed nothing (duplicate callback, or arrived after a final state). */
  noop: boolean;
}

/**
 * Idempotent payment state machine.
 *  - Duplicate callbacks: SUCCESSFUL + success → noop, never a second grant.
 *  - Late success after EXPIRED (provider confirms after our timeout): honoured, because the
 *    customer really was charged — they get access. This is the money-safe choice.
 *  - Any other signal on a terminal state is ignored.
 */
export function transition(current: PaymentStatusCode, signal: PaymentSignal): Transition {
  const stay: Transition = { next: current, grantAccess: false, noop: true };

  if (current === 'PENDING') {
    switch (signal.type) {
      case 'provider_success':
        return { next: 'SUCCESSFUL', grantAccess: true, noop: false };
      case 'provider_declined':
        return { next: 'DECLINED', grantAccess: false, noop: false };
      case 'provider_failed':
        return { next: 'FAILED', grantAccess: false, noop: false };
      case 'timeout':
        return { next: 'EXPIRED', grantAccess: false, noop: false };
    }
  }

  if (current === 'EXPIRED' && signal.type === 'provider_success') {
    return { next: 'SUCCESSFUL', grantAccess: true, noop: false };
  }

  return stay;
}

export function isExpiredPending(
  status: PaymentStatusCode,
  expiresAt: Date,
  now: Date,
): boolean {
  return status === 'PENDING' && now >= expiresAt;
}

/** Candidate-facing copy; the design promises "You were not charged." for declined/expired. */
export function candidateMessage(status: PaymentStatusCode): string {
  switch (status) {
    case 'PENDING':
      return 'Approve the payment on your phone.';
    case 'SUCCESSFUL':
      return 'Payment confirmed.';
    case 'DECLINED':
      return 'The payment was declined. You were not charged.';
    case 'EXPIRED':
      return 'The request expired. You were not charged.';
    case 'FAILED':
      return 'The payment did not go through. You were not charged.';
  }
}
