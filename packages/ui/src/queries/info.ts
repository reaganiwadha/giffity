import { queryOptions } from '@tanstack/react-query';
import { fetchRepoInfo } from '../lib/api';

export function repoInfoOptions(ref?: string, session?: string) {
  return queryOptions({
    queryKey: ['repo-info', session ?? null, ref ?? null],
    queryFn: () => fetchRepoInfo(ref, session),
  });
}
