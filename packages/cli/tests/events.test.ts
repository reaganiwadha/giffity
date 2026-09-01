import { describe, it, expect, vi } from 'vitest';
import {
  publish,
  subscribe,
  subscribedSessionIds,
  type DiffityEvent,
} from '../src/events.js';

describe('events bus', () => {
  it('delivers session-scoped events only to matching subscribers', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unA = subscribe('sess-a', a);
    const unB = subscribe('sess-b', b);

    publish({ type: 'thread:created', sessionId: 'sess-a' });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();

    unA();
    unB();
  });

  it('delivers broadcast (no sessionId) events to everyone', () => {
    const listener = vi.fn();
    const un = subscribe('sess-x', listener);

    publish({ type: 'thread:updated' } as DiffityEvent);
    expect(listener).toHaveBeenCalledTimes(1);

    un();
  });

  it('stops delivery after unsubscribe and drops the subscriber count', () => {
    const listener = vi.fn();
    const un = subscribe('sess-count', listener);
    expect(subscribedSessionIds()).toContain('sess-count');

    un();
    publish({ type: 'diff:stale', sessionId: 'sess-count' });

    expect(listener).not.toHaveBeenCalled();
    expect(subscribedSessionIds()).not.toContain('sess-count');
  });

  it('reference-counts multiple subscribers for one session', () => {
    const un1 = subscribe('multi', vi.fn());
    const un2 = subscribe('multi', vi.fn());
    expect(subscribedSessionIds()).toContain('multi');
    un1();
    expect(subscribedSessionIds()).toContain('multi');
    un2();
    expect(subscribedSessionIds()).not.toContain('multi');
  });
});
