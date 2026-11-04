import { describe, expect, it } from 'vitest';
import { checkResultLine, notChargedLine, receiptRows, rowDetail, statusLabel, statusTone } from './paymentsModel';

const fmt = (iso: string) => `D(${iso.slice(0, 10)})`;

describe('payment history wording (C21)', () => {
  it('labels and tones, never colour alone', () => {
    expect(statusLabel('SUCCESSFUL')).toBe('Paid');
    expect(statusLabel('PENDING')).toBe('Waiting for approval');
    expect(statusTone('DECLINED')).toBe('bad');
    expect(statusTone('PENDING')).toBe('wait');
  });
  it('"You were not charged." on every ending that failed, not on paid or waiting', () => {
    for (const s of ['DECLINED', 'FAILED', 'EXPIRED'] as const) expect(notChargedLine(s)).toBe('You were not charged.');
    expect(notChargedLine('SUCCESSFUL')).toBeNull();
    expect(notChargedLine('PENDING')).toBeNull();
  });
  it('the detail line keeps only what exists', () => {
    expect(rowDetail({ providerLabel: 'MTN MoMo', transactionId: 'TX1', accessUntil: '2026-12-01T00:00:00Z' }, fmt)).toBe('MTN MoMo · ID TX1 · Access until D(2026-12-01)');
    expect(rowDetail({ providerLabel: 'MTN MoMo', transactionId: null, accessUntil: null }, fmt)).toBe('MTN MoMo');
  });
  it('the check result for each status', () => {
    expect(checkResultLine('SUCCESSFUL')).toBe('Payment confirmed. Full Access is active.');
    expect(checkResultLine('PENDING')).toMatch(/Still waiting/);
    expect(checkResultLine('DECLINED')).toContain('You were not charged.');
    expect(checkResultLine('EXPIRED')).toContain('You were not charged.');
  });
  it('receipt rows skip dates the API did not send', () => {
    const rows = receiptRows(
      {
        number: 'TX1',
        issuedTo: { name: 'Aline', email: 'a@x.test' },
        country: { code: 'RW', name: 'Rwanda' },
        plan: { name: 'Full Access', durationDays: 30 },
        paidAt: '2026-11-01T10:00:00Z',
        accessStartsAt: null,
        accessEndsAt: '2026-12-01T00:00:00Z',
      },
      'RWF 2,000',
      'MTN MoMo',
      fmt,
    );
    expect(rows.map((r) => r[0])).toEqual(['Receipt number', 'Issued to', 'Package', 'Country', 'Amount', 'Paid with', 'Paid on', 'Access until']);
    expect(rows[1]![1]).toBe('Aline (a@x.test)');
  });
});
