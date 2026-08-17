import { beforeEach, describe, expect, it } from 'vitest';
import {
  getGameplayControlType,
  recordGameplayControlInput,
  resetGameplayControlType,
} from '@/components/game/controlType';

describe('gameplay control type tracking', () => {
  beforeEach(() => {
    resetGameplayControlType();
  });

  it('is unknown until gameplay input is used', () => {
    expect(getGameplayControlType()).toBe('unknown');
  });

  it.each(['keyboard', 'touch', 'gamepad'] as const)(
    'reports %s when it is the only gameplay input source',
    (type) => {
      recordGameplayControlInput(type);
      recordGameplayControlInput(type);
      expect(getGameplayControlType()).toBe(type);
    },
  );

  it('reports mixed when more than one gameplay input source is used', () => {
    recordGameplayControlInput('touch');
    recordGameplayControlInput('gamepad');
    expect(getGameplayControlType()).toBe('mixed');
  });

  it('resets between game sessions', () => {
    recordGameplayControlInput('keyboard');
    resetGameplayControlType();
    expect(getGameplayControlType()).toBe('unknown');
  });
});
