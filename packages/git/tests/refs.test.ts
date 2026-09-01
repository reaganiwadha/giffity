import { describe, it, expect } from 'vitest';
import { getBranches, getTags, getHeadInfo } from '../src/refs.js';

// These run against giffity's own repo.
describe('refs', () => {
  it('lists local branches and marks the current one', () => {
    const branches = getBranches();
    expect(branches.length).toBeGreaterThan(0);
    const current = branches.filter((b) => b.isCurrent);
    // exactly one current branch unless HEAD is detached
    expect(current.length).toBeLessThanOrEqual(1);
    for (const b of branches) {
      expect(typeof b.name).toBe('string');
      expect(b.name.length).toBeGreaterThan(0);
    }
  });

  it('returns head info', () => {
    const head = getHeadInfo();
    expect(head.hash).toMatch(/^[0-9a-f]{40}$/);
    expect(head.shortHash.length).toBeGreaterThanOrEqual(4);
    expect(typeof head.detached).toBe('boolean');
  });

  it('returns a tag list (possibly empty)', () => {
    expect(Array.isArray(getTags())).toBe(true);
  });
});
