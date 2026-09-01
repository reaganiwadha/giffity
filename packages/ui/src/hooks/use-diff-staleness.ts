import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDiffFingerprint } from '../lib/api';

const POLL_INTERVAL = 3000;

/**
 * Tracks whether the diff on disk has drifted from what the viewer loaded.
 *
 * Live updates come from SSE (`diff:stale` -> `markStale`). When SSE is not
 * connected (`poll = true`) this falls back to polling `/api/diff-fingerprint`.
 */
export function useDiffStaleness(ref?: string, enabled = true, poll = true) {
  const [isStale, setIsStale] = useState(false);
  const baselineRef = useRef<string | null>(null);

  const resetStaleness = useCallback(() => {
    baselineRef.current = null;
    setIsStale(false);
  }, []);

  const markStale = useCallback(() => setIsStale(true), []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    async function check() {
      if (cancelled) {
        return;
      }
      try {
        const fingerprint = await fetchDiffFingerprint(ref);
        if (cancelled) {
          return;
        }
        if (baselineRef.current === null) {
          baselineRef.current = fingerprint;
        } else if (fingerprint !== baselineRef.current) {
          setIsStale(true);
        }
      } catch {
        // ignore fetch errors
      }
      if (!cancelled && poll) {
        timer = setTimeout(check, POLL_INTERVAL);
      }
    }

    // Always take a baseline once; keep polling only when SSE is unavailable.
    check();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ref, enabled, poll]);

  return { isStale, resetStaleness, markStale };
}
