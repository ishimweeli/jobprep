import { useEffect } from 'react';

const SUFFIX = 'JobPrep';

/** Sets `document.title` ("Page — JobPrep") while the page is mounted. */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = `${title} — ${SUFFIX}`;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
