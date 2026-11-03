import { useEffect, useRef, useState } from 'react';

/**
 * A search box that keeps what the user types and reports it after a short pause (the URL is the source of truth:
 * when it changes from outside, for instance from the Overview search, the box follows).
 */
export function useDebouncedSearch(value: string, commit: (next: string) => void, delay = 300) {
  const [text, setText] = useState(value);
  const last = useRef(value);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === last.current) return;
    const id = setTimeout(() => {
      last.current = trimmed;
      commitRef.current(trimmed);
    }, delay);
    return () => clearTimeout(id);
  }, [text, delay]);

  return [text, setText] as const;
}
