/** Display formatting for the admin screens: counts, money totals, dates (as in the artboards), phone numbers, names. */

/** The operators work in Kigali. Every date on screen is shown in this zone, whatever the viewer's laptop says. */
export const ADMIN_TIME_ZONE = 'Africa/Kigali';

export const formatCount = (n: number): string => n.toLocaleString('en-US');

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

/**
 * "RWF 78,000" from the API's own money labels. One label per currency, joined with " · ";
 * nothing at all yet reads as "0" (the API sends no currency then).
 */
export function formatTotals(items: { label: string | null }[], empty = '0'): string {
  const labels = items.map((i) => i.label).filter((l): l is string => !!l);
  return labels.length ? labels.join(' · ') : empty;
}

/** "RWF 2,000" -> 2000 (the price field shows the amount; the currency is the field's label). */
export function amountFromLabel(label: string | null | undefined): string {
  if (!label) return '';
  const m = label.replace(/[A-Z]{3}/, '').replace(/,/g, '').trim();
  return m;
}

// ───────────────────────── Dates

type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: string };
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function partsOf(date: Date | string, tz: string): Parts | null {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long' });
  const o: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) o[p.type] = p.value;
  return { year: +o.year!, month: +o.month!, day: +o.day!, hour: +o.hour!, minute: +o.minute!, weekday: o.weekday! };
}

const hhmm = (p: Parts) => `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
const dayKey = (p: Parts) => p.year * 10_000 + p.month * 100 + p.day;

/** "1 Nov" */
export function formatDay(date: Date | string | null | undefined, tz = ADMIN_TIME_ZONE): string {
  const p = date ? partsOf(date, tz) : null;
  return p ? `${p.day} ${MONTHS_SHORT[p.month - 1]}` : '';
}

/** "17 Oct 2026" */
export function formatDayYear(date: Date | string | null | undefined, tz = ADMIN_TIME_ZONE): string {
  const p = date ? partsOf(date, tz) : null;
  return p ? `${p.day} ${MONTHS_SHORT[p.month - 1]} ${p.year}` : '';
}

/** "21:12" */
export function formatTime(date: Date | string | null | undefined, tz = ADMIN_TIME_ZONE): string {
  const p = date ? partsOf(date, tz) : null;
  return p ? hhmm(p) : '';
}

/** "1 Nov, 21:12" */
export function formatDateTime(date: Date | string | null | undefined, tz = ADMIN_TIME_ZONE): string {
  const p = date ? partsOf(date, tz) : null;
  return p ? `${p.day} ${MONTHS_SHORT[p.month - 1]}, ${hhmm(p)}` : '';
}

/** "Sunday, 1 November 2026" */
export function formatLongDate(date: Date | string | null | undefined, tz = ADMIN_TIME_ZONE): string {
  const p = date ? partsOf(date, tz) : null;
  return p ? `${p.weekday}, ${p.day} ${MONTHS_LONG[p.month - 1]} ${p.year}` : '';
}

/**
 * "Today, 21:14" / "Yesterday" / "29 Oct" (list on desktop); the phone list drops the comma: "Today 21:14".
 * Never signed in reads as an en dash.
 */
export function formatLastActive(date: Date | string | null | undefined, now: Date, opts: { phone?: boolean; tz?: string } = {}): string {
  const tz = opts.tz ?? ADMIN_TIME_ZONE;
  const p = date ? partsOf(date, tz) : null;
  const n = partsOf(now, tz);
  if (!p || !n) return '—';
  if (dayKey(p) === dayKey(n)) return `Today${opts.phone ? '' : ','} ${hhmm(p)}`;
  const y = partsOf(new Date(now.getTime() - 86_400_000), tz);
  if (y && dayKey(p) === dayKey(y)) return 'Yesterday';
  return `${p.day} ${MONTHS_SHORT[p.month - 1]}`;
}

// ───────────────────────── People

export function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

/** "+250788123456" -> "078 812 3456" (how the artboards write a local number). Unknown shapes are returned as they are. */
export function formatLocalPhone(e164: string): string {
  const m = /^\+(?:250|254|255|256)(\d{9})$/.exec(e164.replace(/\s/g, ''));
  if (!m) return e164;
  const n = `0${m[1]}`;
  return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', rw: 'Kinyarwanda', sw: 'Kiswahili', fr: 'French' };
export const languageName = (code: string) => LANGUAGE_NAMES[code] ?? code.toUpperCase();

export const COUNTRY_NAMES: Record<string, string> = { RW: 'Rwanda', KE: 'Kenya', UG: 'Uganda', TZ: 'Tanzania' };
export const countryName = (code: string) => COUNTRY_NAMES[code] ?? code;

export const PROVIDER_NAMES: Record<string, string> = { MTN_MOMO: 'MTN MoMo', AIRTEL_MONEY: 'Airtel Money', MPESA: 'M-Pesa' };
export const providerName = (code: string) => PROVIDER_NAMES[code] ?? code;

/** 45 -> "0:45" (the resend countdown). */
export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
