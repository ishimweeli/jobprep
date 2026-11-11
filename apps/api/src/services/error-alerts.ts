import type { EmailMessage, EmailProvider } from './email';

/**
 * Emails the owner when the app breaks for a user: an unhandled error (HTTP 500) or a 5xx the app raised on purpose
 * (payment provider unreachable, verification email not sent…), a background job failing, or the process crashing.
 *
 * Throttled so a bad deploy is not a thousand emails: the first error is emailed at once, then errors are collected
 * for `windowMs` and sent as one summary (grouped, with a count each). A quiet window ends the cycle, so the next
 * error is again emailed at once. Sending never throws: an alert failing must not break the request that failed.
 *
 * No request bodies, query strings or passwords go in the email: only the method, the path, the user id, the error
 * and the top of its stack.
 */

export interface ErrorEvent {
  /** "POST /api/payments", or "background: payment sweep", or "process: uncaught exception". */
  where: string;
  status?: number;
  /** The error code sent to the client (e.g. provider_unavailable), when there is one. */
  code?: string;
  message: string;
  stack?: string;
  requestId?: string;
  userId?: string;
  at: Date;
}

interface Group {
  first: ErrorEvent;
  count: number;
}

export interface ErrorAlerterOptions {
  email: EmailProvider;
  to: string;
  /** Which site (shown in the email), e.g. https://jobprep.nexvecta.com. */
  site: string;
  windowMs?: number;
  now?: () => Date;
  log?: (...args: unknown[]) => void;
}

const MAX_GROUPS = 15;

/** Strip the query string and turn ids into ":id", so the same failure on different records groups together. */
export function routeOf(method: string, url: string): string {
  const path = url.split('?')[0]!.split('#')[0]!;
  const clean = path
    .split('/')
    .map((s) => (/^[0-9]+$/.test(s) || /^[a-z0-9]{20,}$/i.test(s) || /^[0-9a-f-]{32,36}$/i.test(s) ? ':id' : s))
    .join('/');
  return `${method.toUpperCase()} ${clean}`;
}

const kigali = (d: Date) => `${new Date(d.getTime() + 2 * 3600_000).toISOString().replace('T', ' ').slice(0, 19)} Kigali time`;
const keyOf = (e: ErrorEvent) => `${e.where}|${e.status ?? ''}|${e.code ?? ''}|${e.message.slice(0, 200)}`;
const stackTop = (stack?: string) => (stack ? stack.split('\n').slice(0, 8).map((l) => `    ${l.trim()}`).join('\n') : '');

function describe(e: ErrorEvent, count?: number): string[] {
  const lines = [
    `${count && count > 1 ? `${count} x ` : ''}${e.where}${e.status ? `  ->  HTTP ${e.status}` : ''}${e.code ? ` (${e.code})` : ''}`,
    `  Error: ${e.message}`,
  ];
  if (e.requestId) lines.push(`  Reference: ${e.requestId} (what the user sees on the error page; also in the server log)`);
  if (e.userId) lines.push(`  User id: ${e.userId}`);
  lines.push(`  ${count && count > 1 ? 'First seen' : 'When'}: ${kigali(e.at)}`);
  const st = stackTop(e.stack);
  if (st) lines.push('  Where in the code:', st);
  return lines;
}

const WHERE_TO_LOOK = [
  'Where to look:',
  '  - the full error: docker logs jobprep-1 2>&1 | grep <Reference>   (on Netcup and on Contabo)',
  '  - the last deploy: GitHub, Actions, "Deploy JobPrep"',
];

export function formatFirst(e: ErrorEvent, site: string): EmailMessage {
  const text = [
    'A user just hit an error on JobPrep.',
    '',
    ...describe(e),
    '',
    'More errors in the next minutes will come together in one summary email, not one email each.',
    '',
    ...WHERE_TO_LOOK,
    '',
    `Site: ${site}`,
  ].join('\n');
  return { to: '', subject: `JobPrep ERROR: ${e.where}${e.status ? ` (${e.status})` : ''}`, text };
}

export function formatSummary(groups: Group[], total: number, windowMs: number, site: string): EmailMessage {
  const minutes = Math.round(windowMs / 60_000);
  const shown = groups.slice(0, MAX_GROUPS);
  const lines = [`${total} more error${total === 1 ? '' : 's'} on JobPrep in the last ${minutes} minutes:`, ''];
  for (const g of shown) lines.push(...describe(g.first, g.count), '');
  if (groups.length > shown.length) lines.push(`…and ${groups.length - shown.length} other kinds of error (see the server log).`, '');
  lines.push(...WHERE_TO_LOOK, '', `Site: ${site}`);
  return { to: '', subject: `JobPrep ERRORS: ${total} more in the last ${minutes} minutes`, text: lines.join('\n') };
}

export class ErrorAlerter {
  private readonly email: EmailProvider;
  private readonly to: string;
  private readonly site: string;
  private readonly windowMs: number;
  private readonly now: () => Date;
  private readonly log: (...args: unknown[]) => void;
  /** Collecting for the summary (a window is open) or idle (null). */
  private pending: Map<string, Group> | null = null;
  private pendingTotal = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: ErrorAlerterOptions) {
    this.email = opts.email;
    this.to = opts.to;
    this.site = opts.site;
    this.windowMs = opts.windowMs ?? 15 * 60_000;
    this.now = opts.now ?? (() => new Date());
    this.log = opts.log ?? console.error;
  }

  /** Report an error. Returns the email send when one goes out now (tests await it); never rejects. */
  record(e: Omit<ErrorEvent, 'at'> & { at?: Date }): Promise<void> {
    const ev: ErrorEvent = { ...e, at: e.at ?? this.now() };
    if (this.pending) {
      const k = keyOf(ev);
      const g = this.pending.get(k);
      if (g) g.count++;
      else this.pending.set(k, { first: ev, count: 1 });
      this.pendingTotal++;
      return Promise.resolve();
    }
    this.openWindow();
    return this.send(formatFirst(ev, this.site));
  }

  /** Send what is collected now (before the process exits). */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const p = this.pending;
    const total = this.pendingTotal;
    this.pending = null;
    this.pendingTotal = 0;
    if (p && total > 0) await this.send(formatSummary([...p.values()], total, this.windowMs, this.site));
  }

  private openWindow() {
    this.pending = new Map();
    this.pendingTotal = 0;
    this.timer = setTimeout(() => this.closeWindow(), this.windowMs);
    this.timer.unref?.();
  }

  private closeWindow() {
    this.timer = null;
    const p = this.pending!;
    const total = this.pendingTotal;
    if (total === 0) {
      this.pending = null; // quiet window: the next error is emailed at once
      return;
    }
    // Errors kept coming: send the summary and keep collecting.
    void this.send(formatSummary([...p.values()], total, this.windowMs, this.site));
    this.openWindow();
  }

  private async send(m: EmailMessage): Promise<void> {
    try {
      await this.email.send({ ...m, to: this.to });
    } catch (err) {
      this.log('error alert email failed', err);
    }
  }
}
