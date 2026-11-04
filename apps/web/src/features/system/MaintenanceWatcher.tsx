import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getStatus, legalKeys } from '../../api/legal';
import { getSystemState, setMaintenanceInfo, setSystemState } from '../../lib/systemState';

/**
 * Shows the maintenance page while an admin has switched maintenance on (`GET /api/status`, C26). It checks when the app
 * opens and once a minute, never inside `/admin` (the admin area must stay reachable to switch it off) and never reports
 * its own failures: a status call that fails changes nothing. A maintenance page it did not set (a 503) is left alone.
 */
export function MaintenanceWatcher() {
  const { pathname } = useLocation();
  const inAdmin = pathname.startsWith('/admin');
  const q = useQuery({ queryKey: legalKeys.status, queryFn: getStatus, refetchInterval: 60_000, staleTime: 30_000, retry: false, enabled: !inAdmin });
  const setByUs = useRef(false);
  const m = q.data?.maintenance;

  useEffect(() => {
    if (!m) return;
    if (m.enabled) {
      setMaintenanceInfo({ message: m.message, backAt: m.backAt });
      if (getSystemState() === null) {
        setSystemState('maintenance');
        setByUs.current = true;
      }
    } else {
      setMaintenanceInfo(null);
      if (setByUs.current && getSystemState() === 'maintenance') setSystemState(null);
      setByUs.current = false;
    }
  }, [m?.enabled, m?.message, m?.backAt]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
