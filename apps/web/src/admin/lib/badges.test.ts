import { describe, expect, it } from 'vitest';
import type { PaymentRow, UserDetail } from '../api/types';
import { ACCESS_TONE, COUNTRY_TONE, MODE_TONE, TEST_TONE, accessSummary, historySentence, modeWord, paymentNote, paymentTone } from './badges';

describe('status and badge mapping (colours of the artboards)', () => {
  it('payment statuses collapse to Paid / Pending / Failed', () => {
    expect(paymentTone('SUCCESSFUL')).toMatchObject({ label: 'Paid', bg: '#E3F4E8', ink: '#1E6B3C' });
    expect(paymentTone('PENDING')).toMatchObject({ label: 'Pending', bg: '#FDF1DD', ink: '#8A5300' });
    for (const s of ['FAILED', 'DECLINED', 'EXPIRED'] as const) expect(paymentTone(s)).toMatchObject({ label: 'Failed', bg: '#FBE7E4', ink: '#A1281B' });
  });
  it('access states', () => {
    expect(ACCESS_TONE.active.label).toBe('Full Access');
    expect(ACCESS_TONE.free).toMatchObject({ label: 'Free', bg: '#EEF1F5' });
    expect(ACCESS_TONE.expired.label).toBe('Expired');
    expect(ACCESS_TONE.suspended.bg).toBe('#FBE7E4');
  });
  it('test, country and provider states', () => {
    expect(TEST_TONE.PUBLISHED.label).toBe('Published');
    expect(TEST_TONE.DRAFT.label).toBe('Draft');
    expect(COUNTRY_TONE.PREPARING.label).toBe('Preparing');
    expect(MODE_TONE.SANDBOX.label).toBe('Sandbox');
    expect(modeWord('DISABLED')).toBe('not connected');
    expect(modeWord('LIVE')).toBe('live');
  });
});

describe('the note under a payment status comes from the data', () => {
  const base = { accessUntil: null, waitingMinutes: null, failureReason: null };
  const row = (p: Partial<PaymentRow>) => ({ status: 'PENDING', ...base, ...p }) as Pick<PaymentRow, 'status' | 'accessUntil' | 'waitingMinutes' | 'failureReason'>;
  it('paid: access until', () => {
    expect(paymentNote(row({ status: 'SUCCESSFUL', accessUntil: '2026-12-01T10:00:00Z' }))).toBe('Access until 1 Dec');
    expect(paymentNote(row({ status: 'SUCCESSFUL', accessUntil: '2026-12-01T10:00:00Z' }), true)).toBe('access until 1 Dec');
  });
  it('pending: how long it has waited (never "SMS shows paid")', () => {
    expect(paymentNote(row({ waitingMinutes: 24 }))).toBe('Waiting 24 min');
    expect(paymentNote(row({ waitingMinutes: 24 }), true)).toBe('waiting 24 min');
  });
  it('failed: why', () => {
    expect(paymentNote(row({ status: 'DECLINED' }))).toBe('Declined by user');
    expect(paymentNote(row({ status: 'EXPIRED' }))).toBe('Request expired');
    expect(paymentNote(row({ status: 'FAILED', failureReason: 'insufficient_funds' }))).toBe('Insufficient funds');
    expect(paymentNote(row({ status: 'FAILED', failureReason: 'failed' }))).toBe('Payment failed');
  });
});

describe('ACCESS box of a user', () => {
  const d = (access: Partial<UserDetail['access']>, user: Partial<UserDetail['user']> = {}, adminHistory: UserDetail['adminHistory'] = []) =>
    ({
      access: { state: 'free', endsAt: null, daysLeft: null, expiredAt: null, pendingPaymentSince: null, lastPaymentFailed: false, ...access },
      user: { suspendedReason: null, ...user },
      adminHistory,
    }) as Pick<UserDetail, 'access' | 'user' | 'adminHistory'>;
  it('active: days left and the date', () => {
    expect(accessSummary(d({ state: 'active', daysLeft: 23, endsAt: '2026-11-24T10:00:00Z' }))).toEqual({ line: 'Full Access', meta: '23 days left · until 24 Nov 2026' });
    expect(accessSummary(d({ state: 'active', daysLeft: 1, endsAt: '2026-11-24T10:00:00Z' })).meta).toBe('1 day left · until 24 Nov 2026');
  });
  it('expired, suspended, free with a pending or failed payment', () => {
    expect(accessSummary(d({ state: 'expired', expiredAt: '2026-10-15T10:00:00Z' }))).toEqual({ line: 'Expired', meta: 'Expired 15 Oct 2026' });
    expect(accessSummary(d({ state: 'suspended' }, { suspendedReason: 'shared account' }, [{ id: '1', action: 'user.suspend', actor: 'X', reason: null, at: '2026-10-28T08:00:00Z' }]))).toEqual({ line: 'Suspended', meta: 'Suspended 28 Oct · shared account' });
    expect(accessSummary(d({ state: 'free', pendingPaymentSince: '2026-11-01T19:05:00Z' })).meta).toBe('Payment pending since 21:05');
    expect(accessSummary(d({ state: 'free', lastPaymentFailed: true })).meta).toBe('Last payment failed');
    expect(accessSummary(d({ state: 'free' })).meta).toBe('');
  });
});

describe('admin history sentence', () => {
  it('reads like the artboard', () => {
    expect(historySentence({ action: 'otp.resend', actor: 'Sandrine K.', reason: null })).toBe('Sandrine K. sent a login code');
    expect(historySentence({ action: 'user.send_password_reset', actor: 'Sandrine K.', reason: null })).toBe('Sandrine K. sent a password reset email');
    expect(historySentence({ action: 'user.suspend', actor: 'Jean Bosco N.', reason: 'shared account' })).toBe('Jean Bosco N. suspended the account — reason: shared account');
    expect(historySentence({ action: 'x.y', actor: null, reason: null })).toBe('System x y');
  });
});
