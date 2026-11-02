import { useQuery } from '@tanstack/react-query';
import { attemptKeys, getResult } from '../../api/attempts';
import { buttonClasses, type ButtonVariant } from '../../components/Button';
import { cx } from '../../lib/cx';
import { useStartPractice } from './useStartPractice';

/**
 * "Practice Weak Areas" (Results.dc) / "Practise weak areas" (Review.dc header): builds a practice set from the
 * weak topics of this attempt and opens the runner. Only shown when the result says there are weak areas.
 */
export function StartPracticeLink({
  attemptId, slug, className, label = 'Practise weak areas', variant = 'primary',
}: { attemptId: string; slug: string; className?: string; label?: string; variant?: ButtonVariant }) {
  const result = useQuery({ queryKey: attemptKeys.result(attemptId), queryFn: () => getResult(attemptId), staleTime: 30_000, retry: false });
  const practice = useStartPractice(slug);
  if (!result.data?.canPractice) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => practice.startFromAttempt(attemptId)}
        disabled={practice.pending}
        className={buttonClasses({ variant, size: 'sm', className: cx('cursor-pointer', className) })}
      >
        {label}
      </button>
      {practice.error && (
        <span role="alert" className="text-sm font-semibold text-incorrect">
          {practice.error}
        </span>
      )}
    </>
  );
}
