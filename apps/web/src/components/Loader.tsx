import { cx } from '../lib/cx';

/**
 * The one loading indicator in the app: a spinner and a line of text, announced once to screen readers.
 * It replaces the grey placeholder bars (skeletons) that used to flash on every page. The spinner stops
 * turning for anyone who asked for reduced motion, and the text still says what is loading.
 */
export function Loader({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cx('flex flex-col items-center justify-center gap-3 px-4 py-12 text-center', className)}>
      <span
        aria-hidden="true"
        className="inline-block h-9 w-9 animate-spin rounded-full border-4 border-border border-t-brand motion-reduce:animate-none dark:border-night-border dark:border-t-brand"
      />
      <span className="text-sm text-muted dark:text-night-muted">{label}</span>
    </div>
  );
}
