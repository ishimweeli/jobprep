import { useQuery } from '@tanstack/react-query';
import { catalogKeys, getLanding } from '../../api/catalog';

export const useLanding = (slug: string) =>
  useQuery({ queryKey: catalogKeys.landing(slug), queryFn: () => getLanding(slug), staleTime: 60_000 });
