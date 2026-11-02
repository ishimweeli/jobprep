import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getCountryChangePreview, meKeys, switchCountry } from '../../api/me';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { ErrorState, SkeletonList } from '../../components/states';
import { setStoredCountry } from '../../lib/country';
import { countryPath } from '../country/hooks';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Country code to preview, e.g. "KE". */
  to: string;
}

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <li className="flex gap-2.5">
    <span aria-hidden="true" className="font-extrabold text-brand">
      •
    </span>
    <span>{children}</span>
  </li>
);

/**
 * "Switch to Kenya?" confirmation (ChangeCountryPhone.dc). Data comes from GET /api/me/country-change?to=,
 * the switch itself from POST /api/me/country {countryCode, confirm:true}. Nothing changes until the user confirms.
 * A country that is not live has no designed sheet, so nothing is shown for it.
 */
export function ChangeCountrySheet({ open, onClose, to }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const preview = useQuery({
    queryKey: meKeys.countryChange(to),
    queryFn: () => getCountryChangePreview(to),
    enabled: open && !!to,
    retry: false,
  });

  const confirm = useMutation({
    mutationFn: () => switchCountry(to),
    onSuccess: async () => {
      setStoredCountry(to);
      // Everything cached is country-scoped: drop it and reload the session.
      qc.removeQueries({ queryKey: ['catalog'] });
      await qc.invalidateQueries({ queryKey: meKeys.session });
      onClose();
      navigate(countryPath(to));
    },
  });

  const p = preview.data;
  if (p && !p.to.selectable) return null;

  return (
    <Dialog open={open} onClose={onClose} title={`Switch to ${p?.to.name ?? 'country'}?`} variant="responsive" panelClassName="md:max-w-[480px]">
      {preview.isLoading && <SkeletonList count={2} label="Loading…" />}
      {preview.isError && <ErrorState title="We could not load this" onRetry={() => void preview.refetch()} />}

      {p && p.to.selectable && (
        <div className="flex flex-col gap-3.5">
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[15px] leading-normal text-ink-2">
            <Bullet>
              You’ll see only {p.to.name} mock tests, prices in {p.to.currencyCode}
              {p.to.paymentMethods.length > 0 && <> and {p.to.paymentMethods.join(' or ')} payments</>}.
            </Bullet>
            {p.currentAccess && (
              <Bullet>
                Your {p.from.name} Full Access ({p.currentAccess.daysLeft} {p.currentAccess.daysLeft === 1 ? 'day' : 'days'} left) only covers {p.from.name}{' '}
                tests. It keeps running and is there if you switch back.
              </Bullet>
            )}
            {p.keepsResults && <Bullet>Your {p.from.name} results and progress are kept.</Bullet>}
          </ul>
          {confirm.isError && <ErrorState title="We could not switch your country" message="Nothing was changed. Please try again." />}
          <Button variant="primary" size="lg" block loading={confirm.isPending} onClick={() => confirm.mutate()}>
            Switch to {p.to.name}
          </Button>
          <Button variant="plain" block className="font-semibold" onClick={onClose}>
            Keep {p.from.name}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
