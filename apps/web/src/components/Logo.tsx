import { Link } from 'react-router-dom';
import { cx } from '../lib/cx';

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="6" fill="#164A7A" />
      <path d="M9 16.5l4.5 4.5L23 11" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ to, size = 'lg', dark, className }: { to: string; size?: 'sm' | 'md' | 'lg'; dark?: boolean; className?: string }) {
  const px = size === 'lg' ? 32 : size === 'md' ? 28 : 26;
  return (
    <Link
      to={to}
      aria-label="JobPrep home"
      className={cx(
        'flex items-center gap-2 font-extrabold no-underline md:gap-2.5',
        size === 'lg' ? 'text-[20px] tracking-tight' : size === 'md' ? 'text-[19px]' : 'text-[18px]',
        dark ? 'text-white hover:text-white' : 'text-heading hover:text-heading',
        className,
      )}
    >
      <LogoMark size={px} />
      JobPrep
    </Link>
  );
}
