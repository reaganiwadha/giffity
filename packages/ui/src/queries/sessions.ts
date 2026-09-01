import { queryOptions } from '@tanstack/react-query';
import { fetchSessions, fetchSessionById } from '../lib/api';

export function sessionsOptions(includeArchived = false) {
  return queryOptions({
    queryKey: ['sessions', includeArchived],
    queryFn: () => fetchSessions(includeArchived),
  });
}

export function sessionOptions(id: string) {
  return queryOptions({
    queryKey: ['session', id],
    queryFn: () => fetchSessionById(id),
  });
}
