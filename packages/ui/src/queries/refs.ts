import { queryOptions } from '@tanstack/react-query';
import { fetchRefs } from '../lib/api';

export function refsOptions() {
  return queryOptions({
    queryKey: ['refs'],
    queryFn: fetchRefs,
    staleTime: 10_000,
  });
}
