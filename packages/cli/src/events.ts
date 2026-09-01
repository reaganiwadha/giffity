import { EventEmitter } from 'node:events';

export type DiffityEventType =
  | 'thread:created'
  | 'thread:updated'
  | 'thread:deleted'
  | 'comment:added'
  | 'session:created'
  | 'session:lanes-changed'
  | 'session:archived'
  | 'diff:stale';

export interface DiffityEvent {
  type: DiffityEventType;
  /** Omit for events that are not scoped to a single session (broadcast). */
  sessionId?: string;
  payload?: unknown;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const CHANNEL = 'event';

/** Live SSE subscriber counts, keyed by session id. */
const subscriberCounts = new Map<string, number>();

export function publish(event: DiffityEvent): void {
  emitter.emit(CHANNEL, event);
}

/**
 * Subscribes to events for a session. The listener also receives broadcast
 * events (those without a `sessionId`). Returns an unsubscribe function.
 */
export function subscribe(
  sessionId: string | null,
  listener: (event: DiffityEvent) => void,
): () => void {
  const handler = (event: DiffityEvent) => {
    if (!event.sessionId || event.sessionId === sessionId) {
      listener(event);
    }
  };
  emitter.on(CHANNEL, handler);

  if (sessionId) {
    subscriberCounts.set(sessionId, (subscriberCounts.get(sessionId) ?? 0) + 1);
  }

  return () => {
    emitter.off(CHANNEL, handler);
    if (sessionId) {
      const next = (subscriberCounts.get(sessionId) ?? 1) - 1;
      if (next <= 0) {
        subscriberCounts.delete(sessionId);
      } else {
        subscriberCounts.set(sessionId, next);
      }
    }
  };
}

/** Session ids that currently have at least one live SSE subscriber. */
export function subscribedSessionIds(): string[] {
  return [...subscriberCounts.keys()];
}
