import { describe, expect, it } from 'vitest';
import type { CheckoutSummary } from '../../api/types';
import {
  nextExam, canPay, checkoutCopy, displayNumber, LATE_SUCCESS_WINDOW_MS, notCompletedMessage, phaseFor, priceText, receiptNumber, shouldPoll, startLabel, toMsisdn,
} from './checkoutModel';

const rw: CheckoutSummary = {
  country: { code: 'RW', name: 'Rwanda', dialCode: '+250', currencyCode: 'RWF' },
  plan: { name: 'Full Access', priceMinor: 2000, priceLabel: 'RWF 2,000', durationDays: 30, paidOnce: true, checkoutAvailable: true },
  paymentMethods: [{ provider: 'MTN_MOMO', label: 'MTN MoMo', hint: 'MTN numbers' }],
  prefillPhone: '+250788123456',
  currentAccess: null,
  newAccessEndsAt: null,
};
const ke: CheckoutSummary = {
  country: { code: 'KE', name: 'Kenya', dialCode: '+254', currencyCode: 'KES' },
  plan: { name: 'Full Access', priceMinor: null, priceLabel: null, durationDays: 30, paidOnce: true, checkoutAvailable: false },
  paymentMethods: [{ provider: 'MPESA', label: 'M-Pesa', hint: 'Safaricom numbers' }],
  prefillPhone: '+254712345678',
  currentAccess: null,
  newAccessEndsAt: null,
};

describe('checkout state machine (payment status -> screen)', () => {
  it('no payment is the form', () => expect(phaseFor(null)).toBe('form'));
  it('PENDING is "Approve on your phone"', () => expect(phaseFor({ status: 'PENDING' })).toBe('pending'));
  it('SUCCESSFUL is "Payment confirmed", even while editing the number', () => {
    expect(phaseFor({ status: 'SUCCESSFUL' })).toBe('done');
    expect(phaseFor({ status: 'SUCCESSFUL' }, true)).toBe('done');
  });
  it('DECLINED, FAILED and EXPIRED all end in "You were not charged"', () => {
    for (const status of ['DECLINED', 'FAILED', 'EXPIRED'] as const) expect(phaseFor({ status })).toBe('failed');
  });
  it('"Use a different number" goes back to the form while a payment is in flight', () => expect(phaseFor({ status: 'PENDING' }, true)).toBe('form'));
});

describe('polling rule', () => {
  it('polls while PENDING', () => expect(shouldPoll('PENDING', 0)).toBe(true));
  it('stops on final states', () => {
    for (const s of ['SUCCESSFUL', 'DECLINED', 'FAILED'] as const) expect(shouldPoll(s, 0)).toBe(false);
  });
  it('keeps watching an expired payment for a while (a late approval is honoured), then stops', () => {
    expect(shouldPoll('EXPIRED', 1000)).toBe(true);
    expect(shouldPoll('EXPIRED', LATE_SUCCESS_WINDOW_MS + 1)).toBe(false);
  });
  it('does not poll before there is a payment', () => expect(shouldPoll(undefined, 0)).toBe(false));
});

describe('country-driven copy', () => {
  it('Rwanda reads as Checkout.dc', () => {
    const c = checkoutCopy(rw, '1 Dec 2026');
    expect(c.variant).toBe('national');
    expect(c.summaryTitle).toBe('JobPrep Full Access');
    expect(c.summaryLine).toBe('Every mock test, every category · 30 days');
    expect(c.note).toBe('Access starts once payment is confirmed · until 1 Dec 2026');
    expect(c.phoneLabel('MTN MoMo')).toBe('Mobile Money number');
    expect(c.phoneHelp('MTN MoMo')).toBe('You will approve on this phone with your PIN. We never ask for your PIN.');
  });
  it('Kenya reads as CheckoutKenyaPhone.dc', () => {
    const c = checkoutCopy(ke, '1 Dec 2026');
    expect(c.variant).toBe('prefix');
    expect(c.summaryTitle).toBe('JobPrep Full Access · Kenya');
    expect(c.summaryLine).toBe('Every Kenya mock test · 30 days');
    expect(c.note).toBe('Paid once. Nothing renews.');
    expect(c.phoneLabel('M-Pesa')).toBe('M-Pesa phone number');
    expect(c.phoneHelp('M-Pesa')).toBe('An M-Pesa prompt will appear on this phone. Enter your PIN there — we never ask for it.');
  });
  it('price is the API label; with none it is left out (never a placeholder); no price means no pay', () => {
    expect(priceText(rw)).toBe('RWF 2,000');
    expect(priceText(ke)).toBeNull();
    expect(canPay(rw)).toBe(true);
    expect(canPay(ke)).toBe(false);
    expect(canPay({ plan: null })).toBe(false);
  });
});

describe('phone numbers', () => {
  it('Rwanda: 078 812 3456 in, +250788123456 out', () => {
    expect(toMsisdn('078 812 3456', '+250')).toBe('+250788123456');
    expect(toMsisdn('788123456', '+250')).toBe('+250788123456');
    expect(toMsisdn('+250 788 123 456', '+250')).toBe('+250788123456');
    expect(displayNumber('+250788123456', '+250', 'national')).toBe('078 812 3456');
    expect(receiptNumber('+250788123456', '+250', 'national')).toBe('078 812 3456');
  });
  it('Kenya: the chip carries +254, the field takes 712 345 678', () => {
    expect(toMsisdn('712 345 678', '+254')).toBe('+254712345678');
    expect(displayNumber('+254712345678', '+254', 'prefix')).toBe('712 345 678');
  });
  it('rejects numbers that are not 9 national digits', () => {
    expect(toMsisdn('078 812', '+250')).toBeNull();
    expect(toMsisdn('', '+250')).toBeNull();
    expect(toMsisdn('0788123456789', '+250')).toBeNull();
  });
});

describe('states copy', () => {
  it('always says "You were not charged"', () => {
    expect(notCompletedMessage({ status: 'EXPIRED', providerLabel: 'MTN MoMo' })).toBe('The MTN MoMo request expired before it was approved. You were not charged.');
    expect(notCompletedMessage({ status: 'DECLINED', providerLabel: 'Airtel Money' })).toBe('The Airtel Money request was declined. You were not charged.');
    expect(notCompletedMessage({ status: 'FAILED', providerLabel: 'M-Pesa' })).toContain('You were not charged.');
  });
  it('"Start Mock 1 now" from the test title', () => {
    expect(startLabel('Accountant (Public Institution) — Mock 1')).toBe('Start Mock 1 now');
    expect(startLabel('Teacher quiz')).toBe('Start mock test');
    expect(startLabel(undefined)).toBe('Start mock test');
    expect(startLabel('IDP Management Specialist (MINALOC) — Mock Exam 2')).toBe('Start Mock Exam 2 now');
  });

  it('after paying with no test in mind: the first paid exam not taken yet, then any not taken, then the first', () => {
    const free = { slug: 'm1', isFree: true, myAttempts: { count: 1 } };
    const two = { slug: 'm2', isFree: false, myAttempts: null };
    const three = { slug: 'm3', isFree: false };
    expect(nextExam([free, two, three])?.slug).toBe('m2');
    expect(nextExam([{ slug: 'm1', isFree: true }, { slug: 'm2', isFree: false, myAttempts: { count: 2 } }])?.slug).toBe('m1');
    expect(nextExam([free])?.slug).toBe('m1');
    expect(nextExam([])).toBeUndefined();
    expect(nextExam(undefined)).toBeUndefined();
  });
});
