import { useMemo, useRef, useState } from 'react';
import type { RefsResponse } from '../../lib/api';
import { cn } from '../../lib/cn';

interface RefComboboxProps {
  value: string;
  onChange: (ref: string) => void;
  refs?: RefsResponse;
  allowWorkingTree?: boolean;
  placeholder?: string;
}

interface Group {
  label: string;
  items: { ref: string; hint?: string }[];
}

export function RefCombobox(props: RefComboboxProps) {
  const { value, onChange, refs, allowWorkingTree = true, placeholder } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const groups = useMemo<Group[]>(() => {
    if (!refs) return [];
    const out: Group[] = [];
    if (allowWorkingTree) {
      out.push({
        label: 'Working tree',
        items: refs.workingTreeRefs.map((r) => ({ ref: r })),
      });
    }
    out.push({
      label: 'Branches',
      items: refs.branches.map((b) => ({
        ref: b.name,
        hint: b.isCurrent ? 'current' : undefined,
      })),
    });
    if (refs.tags.length) {
      out.push({ label: 'Tags', items: refs.tags.map((t) => ({ ref: t })) });
    }
    out.push({
      label: 'Recent commits',
      items: refs.recentCommits.slice(0, 15).map((c) => ({
        ref: c.shortHash,
        hint: c.message.slice(0, 48),
      })),
    });
    return out;
  }, [refs, allowWorkingTree]);

  const q = query.trim().toLowerCase();
  const filtered = groups
    .map((g) => ({
      ...g,
      items: q
        ? g.items.filter(
            (i) =>
              i.ref.toLowerCase().includes(q) ||
              i.hint?.toLowerCase().includes(q),
          )
        : g.items,
    }))
    .filter((g) => g.items.length);

  return (
    <div className="relative flex-1 min-w-0">
      <input
        value={open ? query : value}
        placeholder={placeholder ?? value}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          setQuery('');
          setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && query.trim()) {
            onChange(query.trim());
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        className="w-full bg-bg border border-border rounded-md px-2.5 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-border bg-bg-secondary shadow-lg">
          {filtered.map((g) => (
            <div key={g.label}>
              <div className="px-2.5 py-1 text-[10px] uppercase tracking-wide text-text-muted bg-bg-tertiary sticky top-0">
                {g.label}
              </div>
              {g.items.map((item) => (
                <button
                  key={g.label + item.ref}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (blurTimer.current) clearTimeout(blurTimer.current);
                    onChange(item.ref);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full text-left px-2.5 py-1.5 text-sm flex items-center gap-2 hover:bg-bg-tertiary',
                    item.ref === value && 'text-accent',
                  )}
                >
                  <span className="font-mono shrink-0">{item.ref}</span>
                  {item.hint && (
                    <span className="text-xs text-text-muted truncate">
                      {item.hint}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
