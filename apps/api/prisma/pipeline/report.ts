import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SmtpEmailProvider, type EmailMessage } from '../../src/services/email';

/** Daily content pipeline, step 4: the status email ("no new jobs", or each job and how many mocks it got). */

export interface JobReport {
  name: string;
  entity: string;
  deadline: string;
  isNew: boolean;
  status: 'added' | 'failed';
  mocksCreated: number;
  questionsAdded: number;
  problems: string[];
  costUsd: number;
}

export interface DailyReport {
  date: string;
  dryRun: boolean;
  adverts: number;
  jobs: JobReport[];
  /** Jobs with work left for a later day (the daily cap was reached). */
  deferred: { name: string; entity: string }[];
  deadlinesUpdated: number;
  totalCostUsd: number;
  error: string | null;
}

/** `sync`: what happened to production ("success", "failure", "skipped"); `write`: the writing job's outcome. */
export function formatReport(r: DailyReport | null, sync: string, write: string, today = new Date().toISOString().slice(0, 10)): Omit<EmailMessage, 'to'> {
  if (!r) {
    return {
      subject: `JobPrep daily content ${today}: the run FAILED`,
      text: `The daily MIFOTRA content run did not finish (writing step: ${write}), so no report was produced and nothing was published.\n\nOpen the "Daily content from MIFOTRA" run in GitHub Actions for the log.`,
    };
  }
  const added = r.jobs.filter((j) => j.status === 'added');
  const failed = r.jobs.filter((j) => j.status === 'failed');
  const mocks = added.reduce((s, j) => s + j.mocksCreated, 0);
  const tag = r.dryRun ? ' (DRY RUN)' : '';
  const published = r.dryRun
    ? 'Dry run: nothing was saved or published.'
    : sync === 'success' ? 'Published to jobprep.nexvecta.com.'
      : sync === 'skipped' ? 'Nothing new to publish.'
        : `Publishing to production did NOT succeed (${sync}). The content is committed to main; run "Sync content to production" once the cause is fixed.`;

  const lines: string[] = [];
  let subject: string;
  if (r.error) {
    subject = `JobPrep daily content ${r.date}${tag}: the run FAILED`;
    lines.push(`The run stopped with an error: ${r.error}`, '');
  } else if (!r.jobs.length) {
    subject = `JobPrep daily content ${r.date}${tag}: no new jobs`;
    lines.push(`No new jobs on MIFOTRA today. ${r.adverts} open advert(s), all already have their mocks.`, '');
  } else {
    subject = `JobPrep daily content ${r.date}${tag}: ${added.length} job(s), ${mocks} new mock(s)${failed.length ? `, ${failed.length} failed` : ''}`;
    lines.push(`${r.adverts} open advert(s) on MIFOTRA. ${r.jobs.length} job(s) needed work today.`, '');
  }
  if (added.length) {
    lines.push('Added:');
    for (const j of added) {
      const what = [j.mocksCreated && `${j.mocksCreated} new mock(s)`, j.questionsAdded && `${j.questionsAdded} question(s) added to existing mocks`].filter(Boolean).join(', ');
      lines.push(`- ${j.name} (${j.entity})${j.isNew ? ' [NEW JOB]' : ''}, closes ${j.deadline}: ${what}`);
    }
    lines.push('');
  }
  if (failed.length) {
    lines.push('Not added (failed the quality check; will be retried tomorrow):');
    for (const j of failed) lines.push(`- ${j.name} (${j.entity}): ${j.problems.slice(0, 3).join(' | ') || 'no output'}`);
    lines.push('');
  }
  if (r.deferred.length) lines.push(`Waiting for a later run (daily limit reached): ${r.deferred.map((d) => `${d.name} (${d.entity})`).join(', ')}`, '');
  if (r.deadlinesUpdated) lines.push(`Closing dates updated on ${r.deadlinesUpdated} mock(s).`, '');
  lines.push(published, `Writing cost: about $${r.totalCostUsd.toFixed(2)}.`);
  return { subject, text: lines.join('\n') };
}

/** `tsx prisma/pipeline/report.ts <report.json>`: sends the email through the app's MAIL_* account. */
async function main() {
  const [file] = process.argv.slice(2);
  const to = process.env.REPORT_TO;
  if (!to) throw new Error('REPORT_TO is not set');
  const report = file && existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as DailyReport) : null;
  const message = formatReport(report, process.env.SYNC_STATUS ?? 'skipped', process.env.WRITE_STATUS ?? 'unknown');
  const env = (k: string) => process.env[k] ?? '';
  const mail = new SmtpEmailProvider({
    MAIL_HOST: env('MAIL_HOST'),
    MAIL_PORT: Number(env('MAIL_PORT') || 465),
    MAIL_USERNAME: env('MAIL_USERNAME'),
    MAIL_PASSWORD: env('MAIL_PASSWORD'),
    MAIL_STARTTLS: env('MAIL_STARTTLS') !== 'false',
    MAIL_FROM_ADDRESS: env('MAIL_FROM_ADDRESS'),
    MAIL_FROM_NAME: env('MAIL_FROM_NAME') || 'JobPrep',
  });
  await mail.send({ to, ...message });
  console.log(`report sent to ${to}: ${message.subject}`);
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === resolve(fileURLToPath(import.meta.url)).toLowerCase()) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
