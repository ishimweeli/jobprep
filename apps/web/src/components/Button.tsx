import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cx } from '../lib/cx';

export type ButtonVariant = 'primary' | 'secondary' | 'final' | 'neutral' | 'ghost' | 'plain';
export type ButtonSize = 'md' | 'lg' | 'sm';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover hover:text-white border border-transparent',
  secondary: 'bg-surface text-brand hover:text-brand border border-brand',
  final: 'bg-dark text-white hover:bg-brand-hover hover:text-white border border-transparent',
  neutral: 'bg-surface text-ink border border-input-border hover:bg-soft hover:text-ink',
  ghost: 'bg-transparent text-brand hover:text-brand border border-transparent',
  plain: 'bg-transparent text-ink hover:bg-soft hover:text-ink border border-transparent',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-touch px-3 text-[15px] font-semibold rounded-control',
  md: 'min-h-[48px] px-5 text-[16px] font-semibold rounded-control md:min-h-[44px]',
  lg: 'min-h-[48px] px-5 text-[16px] font-semibold rounded-control md:min-h-[44px]',
};

/** Class string shared by <Button> and <LinkButton> so links can look like buttons (and stay real links). */
export function buttonClasses(opts: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}): string {
  const { variant = 'primary', size = 'md', block, className } = opts;
  return cx(
    'inline-flex items-center justify-center gap-2 text-center no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-60',
    variants[variant],
    sizes[size],
    block && 'w-full',
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, block, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, block, className })}
      {...rest}
    >
      {children}
    </button>
  );
});

interface LinkButtonProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  children: ReactNode;
}

export function LinkButton({ variant, size, block, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link className={buttonClasses({ variant, size, block, className })} {...rest}>
      {children}
    </Link>
  );
}

interface ActionLinkProps extends LinkProps {
  /** Is the destination screen built? When false the action is drawn as designed but does nothing. */
  ready: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  children: ReactNode;
}

/**
 * A button from the design whose follow-up screen does not exist yet (see ROUTES_READY).
 * Until the destination is built it renders exactly as drawn but is inert: no navigation, no invented screen.
 */
export function ActionLink({ ready, variant, size, block, className, children, to, ...rest }: ActionLinkProps) {
  const classes = buttonClasses({ variant, size, block, className });
  if (ready) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" aria-disabled="true" className={cx(classes, 'cursor-default')}>
      {children}
    </button>
  );
}
