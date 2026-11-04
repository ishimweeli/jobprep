import { afterEach, describe, expect, it, vi } from 'vitest';
import { countCsvRows, exportFilename, exportUrl, fetchPaymentsExport } from '../../api/users-payments';
import { mockFetch } from '../../test/utils';
import { emptyExportForm, exportQuery, exportSummary, validateExport } from './exportModel';

afterEach(() => vi.unstubAllGlobals());

describe('the accounting export form', () => {
  it('starts on Paid, all dates, all countries', () => {
    expect(emptyExportForm()).toEqual({ from: '', to: '', country: '', status: 'paid', provider: '' });
  });

  it('both dates are optional; the end may not be before the start', () => {
    expect(validateExport({ ...emptyExportForm(), from: '2026-10-01', to: '2026-10-31' })).toEqual({});
    expect(validateExport({ ...emptyExportForm(), from: '2026-10-31', to: '2026-10-01' })).toEqual({ to: 'The end date is before the start date.' });
    expect(validateExport({ ...emptyExportForm(), from: '2026-10-01' })).toEqual({});
    expect(validateExport({ ...emptyExportForm(), from: '2026-02-30' })).toEqual({ from: 'Enter a real date.' });
    expect(validateExport({ ...emptyExportForm(), to: 'soon' })).toEqual({ to: 'Enter a real date.' });
  });

  it('builds the request without empty values', () => {
    expect(exportQuery({ ...emptyExportForm('RW'), from: '2026-10-01' })).toEqual({ from: '2026-10-01', to: undefined, country: 'RW', status: 'paid', provider: undefined });
    expect(exportUrl({ status: 'paid' })).toBe('/api/admin/payments/export?status=paid');
    expect(exportUrl({ status: 'all', from: '2026-10-01', to: '2026-10-31', country: 'RW', provider: 'MTN_MOMO' })).toBe(
      '/api/admin/payments/export?from=2026-10-01&to=2026-10-31&country=RW&status=all&provider=MTN_MOMO',
    );
  });

  it('describes what will be exported', () => {
    expect(exportSummary({ ...emptyExportForm(), from: '2026-10-01', to: '2026-10-31' }, 'Rwanda')).toBe('paid, Rwanda, 2026-10-01 to 2026-10-31');
    expect(exportSummary(emptyExportForm(), '')).toBe('paid, all countries, all dates');
  });
});

describe('the export download', () => {
  it('takes the file name from the server, else makes one', () => {
    expect(exportFilename('attachment; filename="payments-2026-10.csv"', { status: 'paid' })).toBe('payments-2026-10.csv');
    expect(exportFilename(null, { status: 'paid', from: '2026-10-01', to: '2026-10-31' })).toBe('payments-paid-2026-10-01_to_2026-10-31.csv');
    expect(exportFilename(null, { status: 'all' })).toBe('payments-all.csv');
  });

  it('counts data rows (the header is not one)', () => {
    expect(countCsvRows('date,id\r\n2026-11-01,p1\r\n2026-11-01,p2\r\n')).toBe(2);
    expect(countCsvRows('date,id\n')).toBe(0);
    expect(countCsvRows('')).toBe(0);
  });

  it('fetches the file with the session and counts its rows', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response('date,id\n2026-11-01,p1\n', { status: 200, headers: { 'Content-Disposition': 'attachment; filename="p.csv"' } });
    }));
    const f = await fetchPaymentsExport({ status: 'paid' });
    expect(calls[0]!.init?.credentials).toBe('include');
    expect(f).toMatchObject({ filename: 'p.csv', rows: 1 });
  });

  it('turns a refusal into an ApiError with its code, and a lost connection into status 0', async () => {
    mockFetch(() => ({ status: 400, body: { error: 'invalid_range' } }));
    await expect(fetchPaymentsExport({ status: 'paid' })).rejects.toMatchObject({ status: 400, code: 'invalid_range' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(fetchPaymentsExport({ status: 'paid' })).rejects.toMatchObject({ status: 0 });
  });
});
