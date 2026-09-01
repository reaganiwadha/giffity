import { exec, execLines } from './exec.js';
import { getCurrentBranch, getHeadHash } from './repo.js';

export interface BranchRef {
  name: string;
  isCurrent: boolean;
  upstream: string | null;
}

export function getBranches(): BranchRef[] {
  const current = getCurrentBranch();
  const lines = execLines(
    'git for-each-ref --sort=-committerdate --format="%(refname:short)|%(upstream:short)" refs/heads',
  );
  return lines
    .filter(Boolean)
    .map((line) => {
      const [name, upstream] = line.split('|');
      return {
        name,
        isCurrent: name === current,
        upstream: upstream || null,
      };
    });
}

export function getTags(): string[] {
  return execLines(
    'git for-each-ref --sort=-creatordate --format="%(refname:short)" refs/tags',
  ).filter(Boolean);
}

export interface HeadInfo {
  branch: string;
  hash: string;
  shortHash: string;
  detached: boolean;
}

export function getHeadInfo(): HeadInfo {
  const branch = getCurrentBranch();
  const hash = getHeadHash();
  let shortHash = hash.slice(0, 7);
  try {
    shortHash = exec('git rev-parse --short HEAD');
  } catch {
    // keep the sliced fallback
  }
  return { branch, hash, shortHash, detached: branch === 'HEAD' };
}
