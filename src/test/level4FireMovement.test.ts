import { describe, expect, it } from 'vitest';
import { initLevel4, updateLevel4 } from '@/components/game/level4/level4';

describe('Level 4 dragon fire movement', () => {
  it('continues processing player input while the dragon breathes fire', () => {
    const state = initLevel4(1);
    state.monkeys = [];
    state.greenCanSpawned = true;
    state.invuln = 120;
    state.dragon.state = 'roam';
    state.dragon.airborne = false;
    state.dragon.platIdx = 0;
    state.dragon.x = 400;
    state.dragon.fireTimer = 20;

    const initialX = state.player.x;
    updateLevel4(state, { left: false, right: true, up: false, down: false, jump: false });

    expect(state.player.x).toBeGreaterThan(initialX);
    expect(state.dragon.fireTimer).toBe(19);
  });
});
