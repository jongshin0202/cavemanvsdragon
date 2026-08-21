import { describe, expect, it } from 'vitest';
import { mergeGlobalEntry, type GlobalEntry } from '@/components/game/globalLeaderboard';

describe('global leaderboard canonical row merge', () => {
  it('replaces a stale row for the same player instead of displaying it twice', () => {
    const stale: GlobalEntry = {
      id: 'player-jong', name: 'Jong', score: 300, level: 1, created_at: '2026-08-21T07:25:00Z',
    };
    const improved: GlobalEntry = {
      id: 'player-jong', name: 'Jong', score: 1100, level: 1, created_at: '2026-08-21T07:29:00Z',
    };

    expect(mergeGlobalEntry([stale], improved)).toEqual([improved]);
  });
});
