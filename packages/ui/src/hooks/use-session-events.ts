import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface DiffityEvent {
  type: string;
  sessionId?: string;
}

interface Options {
  onDiffStale?: () => void;
}

/**
 * Opens a single Server-Sent Events stream for a session and turns pushed
 * events into TanStack Query invalidations. Replaces the old polling loops.
 * Returns `{ connected }` so callers can keep a polling fallback while SSE is
 * unavailable.
 */
export function useSessionEvents(
  sessionId: string | null | undefined,
  options: Options = {},
) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const onDiffStale = useRef(options.onDiffStale);
  onDiffStale.current = options.onDiffStale;

  useEffect(() => {
    if (!sessionId || typeof window === 'undefined' || !window.EventSource) {
      setConnected(false);
      return;
    }

    const source = new EventSource(
      `/api/events?session=${encodeURIComponent(sessionId)}`,
    );

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false); // EventSource auto-reconnects

    source.onmessage = (e) => {
      let evt: DiffityEvent;
      try {
        evt = JSON.parse(e.data);
      } catch {
        return;
      }

      if (evt.type.startsWith('thread:') || evt.type === 'comment:added') {
        queryClient.invalidateQueries({ queryKey: ['threads', sessionId] });
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      } else if (evt.type === 'session:lanes-changed') {
        queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
        queryClient.invalidateQueries({ queryKey: ['repo-info'] });
        queryClient.invalidateQueries({ queryKey: ['diff'] });
      } else if (
        evt.type === 'session:created' ||
        evt.type === 'session:archived'
      ) {
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      } else if (evt.type === 'diff:stale') {
        onDiffStale.current?.();
      }
    };

    return () => {
      source.close();
      setConnected(false);
    };
  }, [sessionId, queryClient]);

  return { connected };
}
