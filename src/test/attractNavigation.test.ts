import { describe, expect, it } from 'vitest';
import { adjacentAttractScreen } from '../components/game/attractNavigation';

describe('attract screen navigation', () => {
  it('cycles title, local, and global screens on mobile in both directions', () => {
    expect(adjacentAttractScreen('intro', true, 1)).toBe('attractLocalLeaderboard');
    expect(adjacentAttractScreen('attractLocalLeaderboard', true, 1)).toBe('attractGlobalLeaderboard');
    expect(adjacentAttractScreen('attractGlobalLeaderboard', true, 1)).toBe('intro');

    expect(adjacentAttractScreen('intro', true, -1)).toBe('attractGlobalLeaderboard');
    expect(adjacentAttractScreen('attractGlobalLeaderboard', true, -1)).toBe('attractLocalLeaderboard');
    expect(adjacentAttractScreen('attractLocalLeaderboard', true, -1)).toBe('intro');
  });

  it('includes controls between title and local leaderboard on desktop', () => {
    expect(adjacentAttractScreen('intro', false, 1)).toBe('attractControls');
    expect(adjacentAttractScreen('attractControls', false, 1)).toBe('attractLocalLeaderboard');
    expect(adjacentAttractScreen('attractLocalLeaderboard', false, 1)).toBe('attractGlobalLeaderboard');
    expect(adjacentAttractScreen('attractGlobalLeaderboard', false, 1)).toBe('intro');

    expect(adjacentAttractScreen('intro', false, -1)).toBe('attractGlobalLeaderboard');
    expect(adjacentAttractScreen('attractGlobalLeaderboard', false, -1)).toBe('attractLocalLeaderboard');
    expect(adjacentAttractScreen('attractLocalLeaderboard', false, -1)).toBe('attractControls');
    expect(adjacentAttractScreen('attractControls', false, -1)).toBe('intro');
  });
});
