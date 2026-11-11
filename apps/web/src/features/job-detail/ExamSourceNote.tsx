import { ExternalLink, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { NEW_TAB } from '../legal/legalModel';

/** The official recruitment portal, where the real job adverts are published. */
export const MIFOTRA_PORTAL = 'https://recruitment.mifotra.gov.rw/';
export const HOW_WE_BUILD_PATH = '/how-we-build-exams';

/**
 * The jobs whose exams include real questions that candidates reported from earlier MIFOTRA written exams. Every other
 * job's exams are written by us and must keep saying so.
 */
const PAST_PAPER_JOBS = new Set(['executive secretary', 'economic development officer', 'human capital & social development officer']);

export function usesPastPapers(jobName: string): boolean {
  return PAST_PAPER_JOBS.has(jobName.trim().toLowerCase());
}

/**
 * Licensing exams whose first mocks hold real questions candidates reported from earlier council exams (matched on the
 * start of the exam name, e.g. "Nurses and Midwives Licensing Exam (NCNM)").
 */
const PAST_PAPER_LICENSING = ['nurses and midwives licensing exam'];

export function licensingUsesPastPapers(jobName: string): boolean {
  const n = jobName.trim().toLowerCase();
  return PAST_PAPER_LICENSING.some((p) => n.startsWith(p));
}

/** The note for a council licensing exam (category "licensing-exams"). */
export function licensingSourceLine(jobName: string): string {
  if (licensingUsesPastPapers(jobName)) {
    return `The past papers are real questions that candidates shared from earlier sittings of the ${jobName} (2015 to 2020), word for word and in the original order; the first mocks also mix in real questions from the 2018 and 2020 papers. We checked each answer against current clinical guidance and left out questions that are unreadable or have no single correct answer today. The other questions are practice questions we wrote in the same style, on the exam's subject areas. We cannot promise the same questions will appear in your exam.`;
  }
  return `Questions are written around the subject areas of the ${jobName}. They are practice questions, not real or past exam papers.`;
}

/**
 * Why a candidate can trust these questions, and what they are not. It only says what is true of the content:
 * no claim of expert reviewers or of a match with the real exam, and "real questions" only for the jobs that have them.
 */
export function sourceLine(jobName: string, psychometric: boolean): string {
  if (psychometric) return 'These are practice questions for general reasoning and public service judgment. Mock 5 follows the format of MIFOTRA’s psychometric test, using sample questions reported by candidates. The other mocks are our own practice material and are not real or past exam papers.';
  if (usesPastPapers(jobName)) {
    return `The first ${jobName} exams are mostly made of real questions that candidates reported from earlier MIFOTRA written exams. We checked each answer against the law or policy as it stands today, and corrected it where the reported answer was wrong. The later exams are practice questions we wrote from the same laws and policies, in the style of the real exam, on topics future exams may cover. We cannot promise the same questions will appear in your exam.`;
  }
  return `Questions are written around the duties and qualifications in the published job advert for ${jobName}. They are practice questions, not real or past exam papers.`;
}

/** The note on a job page: where the questions come from, with a way to check the official adverts. */
export function ExamSourceNote({ jobName, psychometric, licensing, countrySlug }: { jobName: string; psychometric?: boolean; licensing?: boolean; countrySlug: string }) {
  return (
    <section aria-labelledby="source-note" className="flex items-start gap-3 rounded-card border border-border bg-surface p-3.5 md:p-4">
      <Info size={18} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none text-brand" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 id="source-note" className="m-0 text-[15px] font-bold text-heading">
          Where these questions come from
        </h2>
        <p className="m-0 text-sm leading-normal text-ink-2">
          {licensing
            ? `${licensingSourceLine(jobName)} JobPrep is independent of the council that sets this exam.`
            : `${sourceLine(jobName, !!psychometric)} JobPrep is independent of MIFOTRA and of the hiring institution.`}
        </p>
        <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
          {countrySlug === 'rw' && !licensing && (
            <a href={MIFOTRA_PORTAL} {...NEW_TAB} className="link inline-flex items-center gap-1">
              Official job adverts on MIFOTRA
              <ExternalLink size={13} strokeWidth={2.2} aria-hidden="true" />
            </a>
          )}
          <Link to={HOW_WE_BUILD_PATH} className="link">
            How we build our exams
          </Link>
        </p>
      </div>
    </section>
  );
}
