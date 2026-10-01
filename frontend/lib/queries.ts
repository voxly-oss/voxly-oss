import { clientsAPI } from '@/lib/api';

/**
 * The one definition of the ['clients'] cache entry. Nine components read it;
 * when each carried its own queryFn they could disagree about what the cache
 * holds (and all of them stopped at the API's 100-row page).
 */
export const clientsQuery = {
    queryKey: ['clients'] as const,
    queryFn: () => clientsAPI.listAll(),
};
