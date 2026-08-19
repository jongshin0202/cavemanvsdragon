import { describe, expect, it } from 'vitest';
import { getBrowserGameplayPauseAction } from '@/components/game/browserPause';

describe('browser gameplay pause input', () => {
  it('pauses web gameplay with Enter and never restarts with R', () => {
    expect(getBrowserGameplayPauseAction({
      isNativeApp: false,
      isPaused: false,
      key: 'Enter',
      source: 'keyboard',
    })).toBe('pause');
    expect(getBrowserGameplayPauseAction({
      isNativeApp: false,
      isPaused: false,
      key: 'R',
      source: 'keyboard',
    })).toBe('consume');
  });

  it('resumes paused web gameplay with any keyboard key', () => {
    for (const key of ['Enter', 'R', 'ArrowLeft', ' ', 'a']) {
      expect(getBrowserGameplayPauseAction({
        isNativeApp: false,
        isPaused: true,
        key,
        source: 'keyboard',
      })).toBe('resume');
    }
  });

  it('does not change native APK input behavior', () => {
    expect(getBrowserGameplayPauseAction({
      isNativeApp: true,
      isPaused: false,
      key: 'R',
      source: 'keyboard',
    })).toBe('none');
  });
});
