import type { ExportQuery, ExportStatus } from '../../api/users-payments';

/** The accounting export form (A16): its values, the checks before the request, and the request it makes. */

export interface ExportForm { from: string; to: string; country: string; status: ExportStatus; provider: string }

export const STATUS_OPTIONS: { value: ExportStatus; label: string }[] = [
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed or expired' },
  { value: 'all', label: 'All statuses' },
];

export const PROVIDER_OPTIONS = [
  { value: '', label: 'All providers' },
  { value: 'MTN_MOMO', label: 'MTN MoMo' },
  { value: 'AIRTEL_MONEY', label: 'Airtel Money' },
  { value: 'MPESA', label: 'M-Pesa' },
];

export const emptyExportForm = (country = ''): ExportForm => ({ from: '', to: '', country, status: 'paid', provider: '' });

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export interface ExportProblems { from?: string; to?: string }

/** Both dates are optional; when given they are real dates and the end is not before the start (the API's `invalid_range`). */
export function validateExport(f: ExportForm): ExportProblems {
  const out: ExportProblems = {};
  if (f.from && !validDate(f.from)) out.from = 'Enter a real date.';
  if (f.to && !validDate(f.to)) out.to = 'Enter a real date.';
  if (!out.from && !out.to && f.from && f.to && f.to < f.from) out.to = 'The end date is before the start date.';
  return out;
}

export const exportQuery = (f: ExportForm): ExportQuery => ({
  from: f.from || undefined, to: f.to || undefined, country: f.country || undefined, status: f.status, provider: f.provider || undefined,
});

/** "Paid, Rwanda, 1 Oct to 31 Oct" for the summary line of the dialog. */
export function exportSummary(f: ExportForm, countryLabel: string): string {
  const status = STATUS_OPTIONS.find((s) => s.value === f.status)?.label.toLowerCase() ?? f.status;
  const range = f.from || f.to ? `${f.from || 'the start'} to ${f.to || 'today'}` : 'all dates';
  return `${status}, ${countryLabel || 'all countries'}, ${range}`;
}
