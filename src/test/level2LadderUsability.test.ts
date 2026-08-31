import { describe, expect, it } from 'vitest';
import {
  isLadderUsableL2,
  setSproutsRuntime,
  type SproutRuntime,
} from '@/components/game/level2/layout';

const sprout = (overrides: Partial<SproutRuntime>): SproutRuntime => ({
  ladderIdx: 0,
  grown: false,
  regrowTimer: 0,
  growProgress: 0,
  phase: 'dormant',
  isTop: false,
  gapIdx: 0,
  ...overrides,
});

describe('Level 2 ladder usability', () => {
  it('keeps a visibly withering vine mountable so climbing revives it', () => {
    setSproutsRuntime([sprout({ phase: 'wither', growProgress: 0.9 })]);
    expect(isLadderUsableL2(0, true)).toBe(true);
    expect(isLadderUsableL2(0, false)).toBe(false);
  });

  it('does not mount dormant or incomplete growing vines', () => {
    setSproutsRuntime([sprout({ phase: 'dormant', growProgress: 0 })]);
    expect(isLadderUsableL2(0)).toBe(false);

    setSproutsRuntime([sprout({ phase: 'grow', growProgress: 0.9 })]);
    expect(isLadderUsableL2(0)).toBe(false);
  });

  it('mounts a fully grown vine', () => {
    setSproutsRuntime([sprout({ phase: 'idle', grown: true, growProgress: 1 })]);
    expect(isLadderUsableL2(0)).toBe(true);
  });
});
