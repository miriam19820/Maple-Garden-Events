import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { reportClientError } from '../utils/reportError';

function shouldSkipQueryError(error: unknown): boolean {
  // Expected auth/session misses — not worth Sentry noise.
  const message = error instanceof Error ? error.message : String(error);
  return /401|unauthorized|לא מחובר/i.test(message);
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (shouldSkipQueryError(error)) return;
      reportClientError(error, {
        tags: { source: 'react-query', kind: 'query' },
        extra: { queryKey: query.queryKey },
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (shouldSkipQueryError(error)) return;
      reportClientError(error, {
        tags: { source: 'react-query', kind: 'mutation' },
        extra: { mutationKey: mutation.options.mutationKey },
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
