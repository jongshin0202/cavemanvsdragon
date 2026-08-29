import { describe, expect, it } from 'vitest';
import { canMountLadder, ladderMountTolerance } from '@/components/game/ladderMount';

describe('ladder mount assistance', () => {
  it('accepts a nearby ladder even when the sprites do not yet overlap', () => {
    expect(ladderMountTolerance(16, 7, 36)).toBe(35);
    expect(canMountLadder(24, 16, 7, 36)).toBe(true);
    expect(canMountLadder(35, 16, 7, 36)).toBe(true);
  });

  it('does not snap to a distant ladder outside the assisted range', () => {
    expect(canMountLadder(35.01, 16, 7, 36)).toBe(false);
    expect(canMountLadder(36, 16, 7, 36)).toBe(false);
  });
});
