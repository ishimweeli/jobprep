import type { HTMLAttributes } from 'react';
import { cx } from '../lib/cx';

/** White bordered surface used across the design (16px radius, 1px #E2E7EF). */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-card border border-border bg-surface', className)} {...rest} />;
}
