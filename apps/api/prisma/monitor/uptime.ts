import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SmtpEmailProvider, type EmailMessage } from '../../src/services/email';

/**
 * Uptime monitor (GitHub Actions "Uptime monitor", every 10 minutes, from the Contabo server): opens the public
 * site, the health endpoint and a real search the way a visitor would, and emails MONITOR_TO when one of them fails.
 * One email when something breaks, a reminder every REMIND_MS while it stays broken, one when it works again.
 *
 *   node --import tsx prisma/monitor/uptime.ts
 *
 * Env: MONITOR_TO (who to email), MONITOR_BASE_URL (default https://jobprep.nexvecta.com), MONITOR_SEARCH_QUERY
 * (default "teacher"), MONITOR_STATE_FILE (what is already known to be down), MONITOR_TEST=true (send a test email
 * with the current results), MONITOR_DRY_RUN=true (print only: no email, no state), plus the app's MAIL_* settings.
 */

export type CheckName = 'site' | 'api' | 'search';

export interface CheckResult {
  name: CheckName;
  ok: boolean;
  /** Why it failed, or a short "what was seen" when it passed. */
  detail: string;
  ms: number;
  url: string;
  /** How many tries it took (a failure used all of them). */
  tries: number;
}

export type State = Partial<Record<CheckName, { since: string; lastAlertAt: string }>>;

export const LABEL: Record<CheckName, string> = { site: 'The website', api: 'The API and database', search: 'Search' };
export const REMIND_MS = 3 * 60 * 60 * 1000;
const TIMEOUT_MS = 15_000;

type FetchFn = typeof fetch;

interface CheckDef {
  path: (query: string) => string;
  /** null = fine; otherwise what is wrong. */
  verify: (status: number, body: string, query: string) => string | null;
}

const json = (body: string): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(body) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export const CHECKS: Record<CheckName, CheckDef> = {
  site: {
    path: () => '/rw',
    verify: (status, body) => (status !== 200 ? `HTTP ${status}` : body.includes('id="root"') ? null : 'the page loaded but the app is missing from it'),
  },
  api: {
    path: () => '/api/health',
    verify: (status, body) => {
      const j = json(body);
      if (status !== 200) return `HTTP ${status}${j?.db === 'down' ? ' (the database is down)' : ''}`;
      return j?.status === 'ok' && j.db === 'up' ? null : 'the health check did not say ok';
    },
  },
  search: {
    path: (q) => `/api/countries/rw/jobs?q=${encodeURIComponent(q)}&pageSize=5`,
    verify: (status, body, q) => {
      if (status !== 200) return `HTTP ${status}`;
      const j = json(body);
      if (!j || !Array.isArray(j.results)) return 'the answer was not a list of jobs';
      return j.results.length > 0 ? null : `searching for "${q}" found no jobs`;
    },
  },
};

const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One check, retried (a deploy or a restart can blip for a few seconds). */
export async function runCheck(
  name: CheckName, base: string, query: string,
  opts: { fetchFn?: FetchFn; tries?: number; gapMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<CheckResult> {
  const { fetchFn = fetch, tries = 3, gapMs = 20_000, sleep = sleepMs } = opts;
  const def = CHECKS[name];
  const url = `${base.replace(/\/+$/, '')}${def.path(query)}`;
  let detail = '';
  let ms = 0;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'jobprep-uptime-monitor' }, redirect: 'follow' });
      const problem = def.verify(res.status, await res.text(), query);
      ms = Date.now() - t0;
      if (!problem) return { name, ok: true, detail: `ok (${ms} ms)`, ms, url, tries: attempt };
      detail = problem;
    } catch (e) {
      ms = Date.now() - t0;
      const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      detail = timedOut ? `no answer within ${TIMEOUT_MS / 1000} seconds` : `could not connect: ${e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : String(e)}`;
    }
    if (attempt < tries) await sleep(gapMs);
  }
  return { name, ok: false, detail, ms, url, tries };
}

export async function runChecks(base: string, query: string, opts?: Parameters<typeof runCheck>[3]): Promise<CheckResult[]> {
  return Promise.all((['site', 'api', 'search'] as const).map((n) => runCheck(n, base, query, opts)));
}

export interface Decision {
  /** Newly failing: tell now. */
  down: CheckResult[];
  /** Still failing, and long enough since the last email to say so again. */
  reminders: CheckResult[];
  /** Working again. */
  recovered: { name: CheckName; since: string }[];
  next: State;
}

/** What to tell the owner, given what was already known to be down. Pure. */
export function decide(prev: State, results: CheckResult[], now: Date, remindMs = REMIND_MS): Decision {
  const iso = now.toISOString();
  const d: Decision = { down: [], reminders: [], recovered: [], next: {} };
  for (const r of results) {
    const p = prev[r.name];
    if (!r.ok) {
      if (!p) { d.down.push(r); d.next[r.name] = { since: iso, lastAlertAt: iso }; }
      else if (now.getTime() - Date.parse(p.lastAlertAt) >= remindMs) { d.reminders.push(r); d.next[r.name] = { since: p.since, lastAlertAt: iso }; }
      else d.next[r.name] = p;
    } else if (p) d.recovered.push({ name: r.name, since: p.since });
  }
  return d;
}

const kigali = (d: Date) => `${new Date(d.getTime() + 2 * 3600_000).toISOString().replace('T', ' ').slice(0, 16)} Kigali time`;
const minutesBetween = (since: string, now: Date) => Math.max(1, Math.round((now.getTime() - Date.parse(since)) / 60_000));
const duration = (min: number) => (min >= 120 ? `${Math.round(min / 60)} hours` : `${min} minutes`);

/** The email for a decision, or null when there is nothing to say. `test` sends the full picture regardless. */
export function formatAlert(d: Decision, results: CheckResult[], base: string, now: Date, test = false): EmailMessage | null {
  const failing = [...d.down, ...d.reminders];
  if (!test && failing.length === 0 && d.recovered.length === 0) return null;
  const names = (xs: { name: CheckName }[]) => xs.map((x) => LABEL[x.name].toLowerCase()).join(' and ');
  const lines: string[] = [];
  let subject: string;
  if (test) subject = `JobPrep monitor test: ${results.every((r) => r.ok) ? 'everything works' : 'something is failing'}`;
  else if (failing.length === 3) subject = `JobPrep ALERT: the app is ${d.down.length ? 'down' : 'still down'}`;
  else if (failing.length) subject = `JobPrep ALERT: ${names(failing)} ${d.down.length ? 'not working' : 'still not working'}`;
  else subject = `JobPrep recovered: ${names(d.recovered)} working again`;

  if (test) lines.push('This is a test of the JobPrep uptime monitor. If you can read this, alerts reach you.', '');
  if (failing.length) {
    lines.push(d.down.length ? 'Something is wrong. Open the site and look now.' : 'Still not fixed.', '');
    for (const r of failing) {
      lines.push(`PROBLEM: ${LABEL[r.name]}`, `  ${r.detail}`, `  Tried ${r.tries} time${r.tries === 1 ? '' : 's'}: ${r.url}`);
      if (d.reminders.includes(r)) lines.push('  Reminder: this has been failing since the first alert.');
      lines.push('');
    }
  }
  if (d.recovered.length) {
    lines.push(failing.length ? 'Working again:' : 'Everything that was failing works again.', '');
    for (const r of d.recovered) lines.push(`  ${LABEL[r.name]}: was down for about ${duration(minutesBetween(r.since, now))}`);
    lines.push('');
  }
  lines.push('All checks just now:');
  for (const r of results) lines.push(`  ${r.ok ? 'OK  ' : 'FAIL'} ${LABEL[r.name]}: ${r.detail}`);
  lines.push('', `Checked ${base} from the Contabo server at ${kigali(now)}.`);
  if (failing.length) {
    lines.push(
      '',
      'Where to look:',
      '  - the site or API down: docker ps and docker logs jobprep-1 on Netcup and Contabo; the gateway (nginx) on Netcup',
      '  - search failing while the API is up: the catalog data (the jobs list is empty) or the database',
      '  - the last deploy: GitHub, Actions, "Deploy JobPrep"',
    );
  }
  return { to: '', subject, text: lines.join('\n') };
}

function readState(file: string): State {
  try {
    const v = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    return v && typeof v === 'object' ? (v as State) : {};
  } catch {
    return {}; // first run, or an unreadable file: start fresh
  }
}

async function main() {
  const env = (k: string) => process.env[k] ?? '';
  const base = env('MONITOR_BASE_URL') || 'https://jobprep.nexvecta.com';
  const query = env('MONITOR_SEARCH_QUERY') || 'teacher';
  const dry = env('MONITOR_DRY_RUN') === 'true';
  const test = env('MONITOR_TEST') === 'true';
  const stateFile = env('MONITOR_STATE_FILE') || '/state/uptime-state.json';
  const now = new Date();

  const results = await runChecks(base, query);
  for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name}: ${r.detail} (${r.url})`);

  const decision = decide(readState(stateFile), results, now);
  const message = formatAlert(decision, results, base, now, test);
  if (dry) {
    console.log(message ? `\n--- would send ---\nSubject: ${message.subject}\n\n${message.text}` : '\nNothing to send.');
    return;
  }
  if (message) {
    const to = env('MONITOR_TO');
    if (!to) throw new Error('MONITOR_TO is not set: cannot send the alert');
    const mail = new SmtpEmailProvider({
      MAIL_HOST: env('MAIL_HOST'),
      MAIL_PORT: Number(env('MAIL_PORT') || 465),
      MAIL_USERNAME: env('MAIL_USERNAME'),
      MAIL_PASSWORD: env('MAIL_PASSWORD'),
      MAIL_STARTTLS: env('MAIL_STARTTLS') !== 'false',
      MAIL_FROM_ADDRESS: env('MAIL_FROM_ADDRESS'),
      MAIL_FROM_NAME: env('MAIL_FROM_NAME') || 'JobPrep',
    });
    await mail.send({ ...message, to });
    console.log(`emailed ${to}: ${message.subject}`);
  }
  // Remember what was reported only after the email went out, so a failed send is tried again on the next run.
  // A test email changes nothing about what is considered reported.
  if (!test) {
    mkdirSync(dirname(stateFile), { recursive: true });
    writeFileSync(stateFile, JSON.stringify(decision.next, null, 1));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
