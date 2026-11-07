import { useEffect } from 'react';
import { Loader } from '../../components/states';
import { LEGAL_URL } from './legalModel';

/** `/terms`, `/privacy` and `/refund` used to be pages here. Old links and bookmarks now go on to Nexvecta's policy. */
export function LegalRedirect({ slug }: { slug: keyof typeof LEGAL_URL }) {
  useEffect(() => {
    window.location.replace(LEGAL_URL[slug]);
  }, [slug]);
  return <Loader label="Opening…" />;
}
