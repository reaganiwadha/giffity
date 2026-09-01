import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sessionsOptions } from '../../queries/sessions';
import { refsOptions } from '../../queries/refs';
import {
  archiveSession as apiArchive,
  openSession,
  updateSession,
  type SessionSummary,
} from '../../lib/api';
import { LanePicker, type Lane } from './lane-picker';
import { SessionList } from './session-list';
import { PageLoader } from '../layout/skeleton';

export function SessionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [opening, setOpening] = useState(false);

  const { data: sessions, isPending } = useQuery(sessionsOptions(showArchived));
  const { data: refs } = useQuery(refsOptions());

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['sessions'] });

  const handleOpen = async (lanes: Lane[]) => {
    setOpening(true);
    try {
      const { url } = await openSession(lanes);
      navigate(url);
    } finally {
      setOpening(false);
    }
  };

  const handleOpenExisting = (s: SessionSummary) =>
    handleOpen(s.lanes.map((l) => ({ ref: l.ref })));

  const handleArchive = async (s: SessionSummary) => {
    await apiArchive(s.id);
    refresh();
  };

  const handleRename = async (s: SessionSummary, title: string) => {
    if (title.trim() === (s.title ?? '')) return;
    await updateSession(s.id, { title: title.trim() });
    refresh();
  };

  if (isPending) return <PageLoader />;

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      <div className="border-b border-border bg-bg-secondary px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <span className="font-semibold text-lg text-accent">giffity</span>
          {refs?.head.branch && (
            <span className="px-2 py-0.5 bg-bg-tertiary rounded-md font-mono text-xs text-text-secondary">
              {refs.head.branch}
            </span>
          )}
          <span className="text-xs text-text-muted ml-auto">
            {refs?.head.shortHash}
          </span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <LanePicker refs={refs} onSubmit={handleOpen} submitting={opening} />

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-text">Sessions</h2>
            <label className="text-xs text-text-muted flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Show archived
            </label>
          </div>
          <SessionList
            sessions={sessions ?? []}
            onOpen={handleOpenExisting}
            onArchive={handleArchive}
            onRename={handleRename}
          />
        </div>
      </div>
    </div>
  );
}
