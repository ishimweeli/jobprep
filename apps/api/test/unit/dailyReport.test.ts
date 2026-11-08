import { describe, expect, it } from 'vitest';
import { formatReport, type DailyReport, type JobReport } from '../../prisma/pipeline/report';

const base: DailyReport = { date: '2026-11-08', dryRun: false, adverts: 17, jobs: [], deferred: [], deadlinesUpdated: 0, totalCostUsd: 0, error: null };
const job = (over: Partial<JobReport>): JobReport => ({
  name: 'Protection Specialist', entity: 'MINEMA', deadline: '2026-11-20', isNew: true, status: 'added',
  mocksCreated: 5, questionsAdded: 0, problems: [], costUsd: 4.2, ...over,
});

describe('daily content report email', () => {
  it('says there are no new jobs when nothing needed work', () => {
    const m = formatReport(base, 'skipped', 'success');
    expect(m.subject).toBe('JobPrep daily content 2026-11-08: no new jobs');
    expect(m.text).toContain('No new jobs on MIFOTRA today. 17 open advert(s)');
    expect(m.text).toContain('Nothing new to publish.');
  });

  it('lists each job with its new mocks, and the failed ones with why', () => {
    const r: DailyReport = {
      ...base,
      jobs: [job({}), job({ name: 'Accountant', entity: 'NDERA', isNew: false, mocksCreated: 0, questionsAdded: 40 }), job({ name: 'Social Worker', status: 'failed', mocksCreated: 0, problems: ['p1#3: options must be different'] })],
      deferred: [{ name: 'Internal Auditor', entity: 'MINECOFIN' }],
      totalCostUsd: 12.5,
    };
    const m = formatReport(r, 'success', 'success');
    expect(m.subject).toBe('JobPrep daily content 2026-11-08: 2 job(s), 5 new mock(s), 1 failed');
    expect(m.text).toContain('- Protection Specialist (MINEMA) [NEW JOB], closes 2026-11-20: 5 new mock(s)');
    expect(m.text).toContain('- Accountant (NDERA), closes 2026-11-20: 40 question(s) added to existing mocks');
    expect(m.text).toContain('- Social Worker (MINEMA): p1#3: options must be different');
    expect(m.text).toContain('Waiting for a later run (daily limit reached): Internal Auditor (MINECOFIN)');
    expect(m.text).toContain('Published to jobprep.nexvecta.com.');
    expect(m.text).toContain('about $12.50');
  });

  it('marks a dry run and says nothing was published', () => {
    const m = formatReport({ ...base, dryRun: true, jobs: [job({})] }, 'skipped', 'success');
    expect(m.subject).toContain('(DRY RUN)');
    expect(m.text).toContain('Dry run: nothing was saved or published.');
  });

  it('reports a failed publish and a run that produced no report', () => {
    expect(formatReport({ ...base, jobs: [job({})] }, 'failure', 'success').text).toContain('Publishing to production did NOT succeed');
    const crashed = formatReport(null, 'skipped', 'failure', '2026-11-08');
    expect(crashed.subject).toBe('JobPrep daily content 2026-11-08: the run FAILED');
    expect(crashed.text).toContain('nothing was published');
  });
});
