import { describe, expect, it } from 'vitest';
import {
  canMountLadder,
  canStartLadderClimb,
  ladderMountTolerance,
} from '@/components/game/ladderMount';

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

  it('allows Up to mount after the jump press edge even if Jump remains held', () => {
    expect(canStartLadderClimb(true, true, false, false, true)).toBe(true);
  });

  it('gives a newly pressed Jump priority over mounting for that frame', () => {
    expect(canStartLadderClimb(true, true, true, false, true)).toBe(false);
  });
});
