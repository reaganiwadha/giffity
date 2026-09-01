import { useSuspenseQuery } from '@tanstack/react-query';
import { repoInfoOptions } from '../queries/info';

export function useInfo(ref?: string, session?: string) {
  const { data, error } = useSuspenseQuery(repoInfoOptions(ref, session));

  return {
    data,
    error: error?.message ?? null,
  };
}
