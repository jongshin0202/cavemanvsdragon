import { describe, expect, it } from 'vitest';
import { isLandscapeLeaderboardViewport } from '@/components/game/leaderboardViewport';

describe('leaderboard viewport orientation', () => {
  it('selects the compact layout for landscape bounds', () => {
    expect(isLandscapeLeaderboardViewport(1920, 1080)).toBe(true);
  });

  it('preserves the portrait layout for portrait and square bounds', () => {
    expect(isLandscapeLeaderboardViewport(1080, 1920)).toBe(false);
    expect(isLandscapeLeaderboardViewport(1000, 1000)).toBe(false);
  });
});
