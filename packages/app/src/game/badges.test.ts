import { describe, expect, it } from 'vitest';
import { MAX_STAKE } from '@pdc/engine';
import { BADGES, badgeOf } from './badges';

describe('badges', () => {
  it('has one badge per stake, each with its own name', () => {
    expect(BADGES).toHaveLength(MAX_STAKE);
    expect(new Set(BADGES.map((b) => b.name)).size).toBe(MAX_STAKE);
  });

  it('clamps out-of-range stakes to the ends of the ladder', () => {
    expect(badgeOf(0)).toBe(BADGES[0]);
    expect(badgeOf(MAX_STAKE + 5)).toBe(BADGES[MAX_STAKE - 1]);
  });
});
