import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStoredTheme, setStoredTheme, useDocumentTheme, useSetTheme } from './theme';

function matchMediaStub(dark: boolean) {
  const listeners = new Set<() => void>();
  return vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' ? dark : false,
    media: query,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
}

function Toggle() {
  useDocumentTheme();
  const { theme, toggle } = useSetTheme();
  return (
    <button type="button" onClick={toggle}>
      {theme}
    </button>
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
});

describe('theme store (getStoredTheme / setStoredTheme)', () => {
  it('starts with nothing stored', () => {
    expect(getStoredTheme()).toBeNull();
  });
  it('round-trips through localStorage', () => {
    setStoredTheme('dark');
    expect(getStoredTheme()).toBe('dark');
    setStoredTheme('light');
    expect(getStoredTheme()).toBe('light');
  });
});

describe('dark mode toggle (the top bar\'s moon button)', () => {
  it('defaults to the OS preference when nothing was chosen yet', () => {
    vi.stubGlobal('matchMedia', matchMediaStub(true));
    render(<Toggle />);
    expect(screen.getByRole('button')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('defaults to light when the OS has no preference', () => {
    vi.stubGlobal('matchMedia', matchMediaStub(false));
    render(<Toggle />);
    expect(screen.getByRole('button')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggling persists the choice and flips <html class="dark">', async () => {
    vi.stubGlobal('matchMedia', matchMediaStub(false));
    const user = userEvent.setup();
    render(<Toggle />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(getStoredTheme()).toBe('dark');

    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(getStoredTheme()).toBe('light');
  });

  it('an explicit choice wins over the OS preference', () => {
    vi.stubGlobal('matchMedia', matchMediaStub(true));
    act(() => setStoredTheme('light'));
    render(<Toggle />);
    expect(screen.getByRole('button')).toHaveTextContent('light');
  });
});
