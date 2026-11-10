import { Link } from 'react-router-dom';
import { buttonClasses } from '../../components/Button';
import { signInPath, signUpPath } from '../../lib/next';

/** A guest's older finished exam: it is submitted and scored, but the marks and review open after sign-up or sign-in. */
export function SignUpToSee({ what, title, next }: { what: string; title?: string; next: string }) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-10 md:py-16">
      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-6 text-center">
        <h1 className="m-0 text-[22px] font-bold">Your exam was submitted</h1>
        <p className="m-0 text-[15px] text-ink-2">
          {title ? <strong>{title}</strong> : 'Your exam'} is saved. Create a free account, or sign in, to see {what}. It takes a minute and keeps your progress.
        </p>
        <Link to={signUpPath(next)} className={buttonClasses({ variant: 'primary', size: 'lg', block: true })}>Sign up free to see my marks</Link>
        <Link to={signInPath(next)} className="text-[15px] font-semibold text-link hover:text-link-hover">I already have an account · Sign in</Link>
      </div>
    </main>
  );
}
