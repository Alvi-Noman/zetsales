import { useQuery } from '@tanstack/react-query';
import { listApps } from '../lib/commerceApi';
import { useAuth } from '../context/AuthContext';

// Shared across every AppBlock on a page (react-query dedupes identical queries), so rendering
// many blocks — e.g. one per order row — costs one GET /commerce/apps, not one per block.
export function useInstalledApps() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['apps', user?.tenantId],
    queryFn: listApps,
    enabled: !!user?.tenantId,
    staleTime: 60_000,
  });
}
