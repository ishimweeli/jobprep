import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '../../components/Logo';

/** Sign-up / sign-in frame: dark pitch panel on large screens (SignUp.dc), logo header on phones (SignUpPhone.dc). */
export function AuthShell({ children, homeTo }: { children: ReactNode; homeTo: string }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface lg:flex-row lg:flex-wrap lg:bg-page">
      <aside className="hidden flex-[1_1_420px] flex-col gap-7 bg-ink p-12 text-white lg:flex">
        <Logo to={homeTo} dark />
        <h2 className="m-0 max-w-[13em] text-[34px] font-bold leading-[1.15] tracking-tight">Practice for the exam you will actually sit.</h2>
        <ul className="m-0 flex max-w-[26em] list-none flex-col gap-3.5 p-0 text-base text-zinc-300">
          {[
            'Choose your country — you only see that country’s exams, prices and payment methods.',
            'Sign in with your phone number. No password to remember.',
            'Pick the job you are preparing for and get a recommended first test.',
          ].map((t, i) => (
            <li key={t} className="flex gap-3">
              <span aria-hidden="true" className="font-extrabold text-brand-ring">
                {i + 1}
              </span>
              {t}
            </li>
          ))}
        </ul>
        <p className="m-0 mt-auto text-[13px] text-zinc-400">Independent practice platform — not affiliated with any government recruitment body.</p>
      </aside>
      <header className="flex items-center px-4 pb-1.5 pt-3.5 lg:hidden">
        <Logo to={homeTo} size="sm" />
      </header>
      <main id="main-content" tabIndex={-1} className="flex flex-[1_1_520px] items-start justify-center px-4 pb-8 pt-3 lg:px-6 lg:py-12">
        <div className="flex w-full max-w-[480px] flex-col gap-5 lg:rounded-[20px] lg:border lg:border-border lg:bg-surface lg:p-7">{children}</div>
      </main>
    </div>
  );
}

export function StepBar({ step, total, onBack }: { step: number; total: number; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-2.5">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-[10px] border border-zinc-300 bg-surface text-ink"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
      )}
      <span className="text-sm font-semibold text-muted">
        Step {step} of {total}
      </span>
      <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-pill bg-soft">
        <span className="block h-1.5 bg-brand" style={{ width: `${(step / total) * 100}%` }} />
      </span>
    </div>
  );
}
