import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { attemptKeys, sendFeedback } from '../../api/attempts';
import { Button } from '../../components/Button';
import { cx } from '../../lib/cx';

export const FEEDBACK = {
  title: 'How was this exam?',
  hint: 'Optional. It takes a few seconds and helps us fix questions and improve the mocks.',
  commentLabel: 'Anything wrong, unclear or missing? (optional)',
  thanks: 'Thank you. Your feedback was sent.',
  failed: 'We could not send your feedback. Check your connection and try again.',
  maxComment: 1000,
};
export const RATING_WORDS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'] as const;

/** An optional rating and comment at the bottom of the results. It never blocks anything: the page works without it. */
export function FeedbackCard({ attemptId, saved }: { attemptId: string; saved: { rating: number; comment: string | null } | null }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(saved?.rating ?? 0);
  const [comment, setComment] = useState(saved?.comment ?? '');
  const [sent, setSent] = useState(!!saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (saved) { setRating(saved.rating); setComment(saved.comment ?? ''); setSent(true); }
  }, [saved]);

  const submit = async () => {
    if (!rating || busy) return;
    setBusy(true);
    setError(false);
    try {
      await sendFeedback(attemptId, { rating, comment: comment.trim() || undefined });
      setSent(true);
      void qc.invalidateQueries({ queryKey: attemptKeys.result(attemptId) });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="feedback-title" className="order-8 flex flex-col gap-3 rounded-card border border-border bg-surface p-4 md:rounded-card-lg md:p-6">
      <div className="flex flex-col gap-0.5">
        <h2 id="feedback-title" className="m-0 text-[17px]">{FEEDBACK.title}</h2>
        <p className="m-0 text-sm text-muted">{FEEDBACK.hint}</p>
      </div>
      <div role="radiogroup" aria-label="Rating from 1 to 5" className="flex flex-wrap gap-2">
        {RATING_WORDS.map((word, i) => {
          const n = i + 1;
          const on = rating === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${n} of 5, ${word}`}
              onClick={() => { setRating(n); setSent(false); }}
              className={cx('flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center rounded-control border px-2 py-1 text-sm font-semibold md:flex-none md:px-4', on ? 'border-brand bg-brand-softer text-brand' : 'border-input-border bg-surface text-ink hover:bg-soft')}
            >
              <span className="text-[17px]" aria-hidden="true">{n}</span>
              <span className="text-xs font-normal text-muted">{word}</span>
            </button>
          );
        })}
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-semibold" htmlFor="feedback-comment">
        {FEEDBACK.commentLabel}
        <textarea
          id="feedback-comment"
          value={comment}
          maxLength={FEEDBACK.maxComment}
          rows={3}
          onChange={(e) => { setComment(e.target.value); setSent(false); }}
          className="rounded-control border border-input-border bg-surface px-3 py-2 text-base font-normal text-ink"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void submit()} loading={busy} disabled={!rating || sent}>{sent ? 'Sent' : 'Send feedback'}</Button>
        {!rating && !sent && <span className="text-sm text-muted">Choose a rating to send.</span>}
        {sent && <span role="status" className="text-sm font-semibold text-correct">{FEEDBACK.thanks}</span>}
        {error && <span role="alert" className="text-sm font-semibold text-incorrect">{FEEDBACK.failed}</span>}
      </div>
    </section>
  );
}
