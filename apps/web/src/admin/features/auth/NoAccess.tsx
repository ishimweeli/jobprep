import { SystemPageBody } from '../../../features/system/SystemPage';
import { countryPath, useActiveCountrySlug } from '../../../features/country/hooks';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

/**
 * Signed in, but the account holds no admin role (or none that opens a page): the web app's system-page pattern
 * (SystemPageBody) with a plain message. No chrome: this is neither a candidate page nor an admin screen.
 */
export function NoAccess() {
  useDocumentTitle('No access');
  const slug = useActiveCountrySlug();
  return (
    <div className="flex min-h-screen flex-col">
      <SystemPageBody kind="no_access" cta={{ to: countryPath(slug) }} />
    </div>
  );
}
