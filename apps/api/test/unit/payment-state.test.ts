import { describe, expect, it } from 'vitest';
import {
  candidateMessage, isExpiredPending, isTerminal, transition,
} from '../../src/domain/payment-state';

describe('payment state machine', () => {
  it('PENDING + success → SUCCESSFUL and grants access exactly once', () => {
    const first = transition('PENDING', { type: 'provider_success' });
    expect(first).toEqual({ next: 'SUCCESSFUL', grantAccess: true, noop: false });
    const dup = transition(first.next, { type: 'provider_success' });
    expect(dup).toEqual({ next: 'SUCCESSFUL', grantAccess: false, noop: true });
  });

  it('decline, failure and timeout end the payment without access', () => {
    expect(transition('PENDING', { type: 'provider_declined' })).toMatchObject({ next: 'DECLINED', grantAccess: false });
    expect(transition('PENDING', { type: 'provider_failed' })).toMatchObject({ next: 'FAILED', grantAccess: false });
    expect(transition('PENDING', { type: 'timeout' })).toMatchObject({ next: 'EXPIRED', grantAccess: false });
  });

  it('honours a success that arrives after our timeout (customer was charged)', () => {
    expect(transition('EXPIRED', { type: 'provider_success' })).toEqual({
      next: 'SUCCESSFUL', grantAccess: true, noop: false,
    });
  });

  it('ignores everything else once terminal', () => {
    for (const s of ['SUCCESSFUL', 'DECLINED', 'FAILED'] as const) {
      expect(transition(s, { type: 'timeout' }).noop).toBe(true);
      expect(transition(s, { type: 'provider_declined' }).noop).toBe(true);
    }
    expect(transition('DECLINED', { type: 'provider_success' }).noop).toBe(true);
    expect(transition('EXPIRED', { type: 'provider_declined' }).noop).toBe(true);
  });

  it('knows terminal states and expiry of pending payments', () => {
    expect(isTerminal('PENDING')).toBe(false);
    expect(isTerminal('EXPIRED')).toBe(true);
    const exp = new Date('2026-11-02T10:00:00Z');
    expect(isExpiredPending('PENDING', exp, new Date('2026-11-02T10:00:01Z'))).toBe(true);
    expect(isExpiredPending('PENDING', exp, new Date('2026-11-02T09:59:59Z'))).toBe(false);
    expect(isExpiredPending('SUCCESSFUL', exp, new Date('2026-11-02T11:00:00Z'))).toBe(false);
  });

  it('promises "You were not charged" for every non-success ending', () => {
    for (const s of ['DECLINED', 'EXPIRED', 'FAILED'] as const) {
      expect(candidateMessage(s)).toContain('You were not charged');
    }
  });
});
