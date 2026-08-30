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

  it('toggles native APK pause with the controller START button', () => {
    expect(getBrowserGameplayPauseAction({
      isNativeApp: true,
      isPaused: false,
      key: 'Start',
      source: 'pad',
    })).toBe('pause');
    expect(getBrowserGameplayPauseAction({
      isNativeApp: true,
      isPaused: true,
      key: 'Start',
      source: 'pad',
    })).toBe('resume');
    expect(getBrowserGameplayPauseAction({
      isNativeApp: true,
      isPaused: false,
      key: ' ',
      source: 'pad',
    })).toBe('none');
  });

  it('toggles phone and desktop web pause with the controller START button', () => {
    expect(getBrowserGameplayPauseAction({
      isNativeApp: false,
      isPaused: false,
      key: 'Start',
      source: 'pad',
    })).toBe('pause');
    expect(getBrowserGameplayPauseAction({
      isNativeApp: false,
      isPaused: true,
      key: 'Start',
      source: 'pad',
    })).toBe('resume');
  });
});
