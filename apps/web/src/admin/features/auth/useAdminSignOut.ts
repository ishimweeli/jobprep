import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from '../../../api/auth';
import { meKeys } from '../../../api/me';

/**
 * The sign-out control of the admin chrome (A1, no design: a plain button under the signed-in name on desktop and an
 * icon button in the phone header). It ends the session (`POST /api/auth/sign-out`), forgets everything cached from
 * the admin API and goes to the home page. A failed call still ends the visit here: the cookie may already be gone.
 */
export function useAdminSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
    } catch {
      /* same result for the person */
    }
    qc.setQueryData(meKeys.session, null);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'countries' });
    setBusy(false);
    navigate('/', { replace: true });
  };
  return { run, busy };
}
