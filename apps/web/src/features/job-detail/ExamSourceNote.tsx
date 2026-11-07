import { ExternalLink, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { NEW_TAB } from '../legal/legalModel';

/** The official recruitment portal, where the real job adverts are published. */
export const MIFOTRA_PORTAL = 'https://recruitment.mifotra.gov.rw/';
export const HOW_WE_BUILD_PATH = '/how-we-build-exams';

/**
 * Why a candidate can trust these questions, and what they are not. It only says what is true of the content:
 * no claim of past papers, expert reviewers or a match with the real exam.
 */
export function sourceLine(jobName: string, psychometric: boolean): string {
  return psychometric
    ? 'These are practice questions for general reasoning and public service judgment. They are not real or past exam papers.'
    : `Questions are written around the duties and qualifications in the published job advert for ${jobName}. They are practice questions, not real or past exam papers.`;
}

/** The note on a job page: where the questions come from, with a way to check the official adverts. */
export function ExamSourceNote({ jobName, psychometric, countrySlug }: { jobName: string; psychometric?: boolean; countrySlug: string }) {
  return (
    <section aria-labelledby="source-note" className="flex items-start gap-3 rounded-card border border-border bg-surface p-3.5 md:p-4">
      <Info size={18} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none text-brand" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 id="source-note" className="m-0 text-[15px] font-bold text-heading">
          Where these questions come from
        </h2>
        <p className="m-0 text-sm leading-normal text-ink-2">
          {sourceLine(jobName, !!psychometric)} JobPrep is independent of MIFOTRA and of the hiring institution.
        </p>
        <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
          {countrySlug === 'rw' && (
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
