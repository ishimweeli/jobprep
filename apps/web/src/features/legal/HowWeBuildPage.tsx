import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { MIFOTRA_PORTAL } from '../job-detail/ExamSourceNote';
import { InfoPage } from './InfoPage';
import { NEW_TAB } from './legalModel';

const sectionClass = 'flex flex-col gap-2';
const headingClass = 'm-0 text-[19px]';
const bodyClass = 'm-0 text-base leading-[1.65] text-ink';

/** How the mock exams are made, in plain words. Only what is true of the content today: no promise about the real exam. */
export function HowWeBuildPage() {
  useDocumentTitle('How we build our exams', 'How JobPrep writes its practice exams for public-service recruitment, and what they are not.');
  return (
    <InfoPage title="How we build our exams" toc={[]}>
      <section className={sectionClass}>
        <h2 className={headingClass}>We start from the job advert</h2>
        <p className={bodyClass}>
          Each job&rsquo;s exams are written around its published advert: the duties, the qualifications and the competencies it asks for. We add public documents connected to the work, such as national policies and laws. You can read the adverts
          yourself on the{' '}
          <a href={MIFOTRA_PORTAL} {...NEW_TAB} className="link">
            MIFOTRA recruitment portal
          </a>
          .
        </p>
      </section>
      <section className={sectionClass}>
        <h2 className={headingClass}>Real questions from earlier exams</h2>
        <p className={bodyClass}>
          The Executive Secretary, Economic Development Officer and Human Capital &amp; Social Development Officer exams include real questions that candidates reported from earlier MIFOTRA written exams. We did not take the answers on trust:
          each one was checked against the law or policy as it stands today. Where the reported answer was wrong or the law has changed, we use the correct answer, and a question that rests on a repealed law is reworded for the current one. Questions
          whose answer we could not confirm from an official source are left out.
        </p>
      </section>
      <section className={sectionClass}>
        <h2 className={headingClass}>What they are not</h2>
        <p className={bodyClass}>
          Apart from those reported questions, our exams are practice questions written by us. They are not complete copies of any past exam paper, and we cannot promise that the same questions will appear in your exam. JobPrep is independent of
          MIFOTRA and of the institutions that are hiring.
        </p>
      </section>
      <section className={sectionClass}>
        <h2 className={headingClass}>How an exam is set up</h2>
        <p className={bodyClass}>
          Written mock exams have 100 questions and 120 minutes. Psychometric exams have 30 questions and 90 minutes. The timer runs as it would in an exam room, there is no negative marking, and every answer comes with an explanation.
        </p>
      </section>
      <section className={sectionClass}>
        <h2 className={headingClass}>If you find a mistake</h2>
        <p className={bodyClass}>
          Tell us through{' '}
          <Link to="/help" className="link">
            Help and support
          </Link>{' '}
          and we will check the question.
        </p>
      </section>
    </InfoPage>
  );
}
