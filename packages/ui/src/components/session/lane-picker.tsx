import { useState } from 'react';
import type { RefsResponse } from '../../lib/api';
import { RefCombobox } from './ref-combobox';
import { PlusIcon } from '../icons/plus-icon';
import { TrashIcon } from '../icons/trash-icon';
import { ChevronUpIcon } from '../icons/chevron-up-icon';
import { ChevronDownIcon } from '../icons/chevron-down-icon';

const WORKING_TREE = new Set(['work', 'staged', 'unstaged', '.']);

export interface Lane {
  ref: string;
}

interface LanePickerProps {
  refs?: RefsResponse;
  onSubmit: (lanes: Lane[]) => void;
  submitting?: boolean;
  initialLanes?: Lane[];
}

function validate(lanes: Lane[]): string | null {
  if (lanes.length < 2) return 'Add at least two lanes.';
  for (let i = 0; i < lanes.length; i++) {
    if (!lanes[i].ref.trim()) return `Lane ${i + 1} is empty.`;
    if (WORKING_TREE.has(lanes[i].ref) && i !== lanes.length - 1) {
      return 'Only the last lane can be a working-tree ref (work / staged / unstaged).';
    }
  }
  return null;
}

export function LanePicker(props: LanePickerProps) {
  const { refs, onSubmit, submitting } = props;
  const defaultBase = refs?.head.branch && refs.head.branch !== 'HEAD'
    ? refs.head.branch
    : 'HEAD';
  const [lanes, setLanes] = useState<Lane[]>(
    props.initialLanes ?? [{ ref: defaultBase }, { ref: 'work' }],
  );

  const set = (i: number, ref: string) =>
    setLanes((prev) => prev.map((l, idx) => (idx === i ? { ref } : l)));
  const remove = (i: number) =>
    setLanes((prev) => prev.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) =>
    setLanes((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const add = () =>
    setLanes((prev) => [
      ...prev.slice(0, -1),
      { ref: 'HEAD' },
      prev[prev.length - 1],
    ]);

  const error = validate(lanes);

  return (
    <div className="border border-border rounded-lg bg-bg-secondary p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-text">New session</h3>
        <span className="text-xs text-text-muted">
          {lanes.length - 1} diff{lanes.length - 1 === 1 ? '' : 's'} · lane N vs
          lane N−1
        </span>
      </div>

      <div className="space-y-1.5">
        {lanes.map((lane, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-5 text-xs text-text-muted text-right">{i}</span>
            <RefCombobox
              value={lane.ref}
              onChange={(r) => set(i, r)}
              refs={refs}
            />
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="p-1 text-text-muted hover:text-text disabled:opacity-30"
              title="Move up"
            >
              <ChevronUpIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === lanes.length - 1}
              className="p-1 text-text-muted hover:text-text disabled:opacity-30"
              title="Move down"
            >
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={lanes.length <= 2}
              className="p-1 text-text-muted hover:text-deleted disabled:opacity-30"
              title="Remove lane"
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1 text-sm text-accent hover:text-accent/80"
      >
        <PlusIcon className="w-3.5 h-3.5" /> Add lane
      </button>

      {error && <p className="text-xs text-deleted">{error}</p>}

      <div className="pt-1">
        <button
          type="button"
          disabled={!!error || submitting}
          onClick={() => onSubmit(lanes.map((l) => ({ ref: l.ref.trim() })))}
          className="px-3 py-1.5 text-sm rounded-md bg-accent text-white font-medium hover:bg-accent/90 disabled:opacity-40"
        >
          {submitting ? 'Opening…' : 'Open session'}
        </button>
      </div>
    </div>
  );
}
