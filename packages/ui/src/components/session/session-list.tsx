import { useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import type { SessionSummary } from '../../lib/api';
import { cn } from '../../lib/cn';
import { TrashIcon } from '../icons/trash-icon';
import { PencilIcon } from '../icons/pencil-icon';

dayjs.extend(relativeTime);

interface SessionListProps {
  sessions: SessionSummary[];
  onOpen: (session: SessionSummary) => void;
  onArchive: (session: SessionSummary) => void;
  onRename: (session: SessionSummary, title: string) => void;
}

export function SessionList(props: SessionListProps) {
  const { sessions, onOpen, onArchive, onRename } = props;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-text-muted py-8 text-center">
        No sessions yet. Create one above.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {sessions.map((s) => (
        <li
          key={s.id}
          className={cn(
            'border border-border rounded-lg bg-bg-secondary px-4 py-3 flex items-center gap-3',
            s.archived && 'opacity-60',
          )}
        >
          <div className="min-w-0 flex-1">
            {editing === s.id ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  onRename(s, draft);
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onRename(s, draft);
                    setEditing(null);
                  }
                  if (e.key === 'Escape') setEditing(null);
                }}
                className="text-sm font-medium bg-bg border border-border rounded px-2 py-0.5 text-text focus:outline-none focus:border-accent"
              />
            ) : (
              <button
                onClick={() => onOpen(s)}
                className="text-sm font-medium text-text hover:text-accent truncate block"
              >
                {s.title || s.name}
              </button>
            )}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {s.lanes.map((lane, i) => (
                <span key={i} className="inline-flex items-center gap-1.5">
                  {i > 0 && <span className="text-text-muted text-xs">→</span>}
                  <span className="px-1.5 py-0.5 bg-bg-tertiary rounded font-mono text-[11px] text-text-secondary">
                    {lane.ref}
                  </span>
                </span>
              ))}
              {s.kind === 'tree' && (
                <span className="text-[11px] text-text-muted">file browser</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 text-xs text-text-muted">
            {s.totalThreadCount > 0 && (
              <span title={`${s.openThreadCount} open of ${s.totalThreadCount}`}>
                {s.openThreadCount > 0 ? (
                  <span className="text-yellow-500">{s.openThreadCount} open</span>
                ) : (
                  <span>{s.totalThreadCount} resolved</span>
                )}
              </span>
            )}
            <span>{dayjs(s.lastOpenedAt).fromNow()}</span>
            <button
              onClick={() => {
                setDraft(s.title || s.name);
                setEditing(s.id);
              }}
              className="p-1 hover:text-text"
              title="Rename"
            >
              <PencilIcon className="w-3.5 h-3.5" />
            </button>
            {!s.archived && (
              <button
                onClick={() => onArchive(s)}
                className="p-1 hover:text-deleted"
                title="Archive"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => onOpen(s)}
              className="px-2.5 py-1 rounded-md bg-accent text-white font-medium hover:bg-accent/90"
            >
              Open
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
