import { describe, expect, it } from 'vitest';
import {
  getBrowserGameplayPauseAction,
  getBrowserPageAudioAction,
} from '@/components/game/browserPause';

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

describe('browser page audio lifecycle', () => {
  it('pauses once when the game tab becomes hidden', () => {
    expect(getBrowserPageAudioAction({
      visibilityState: 'hidden',
      pausedForPageBackground: false,
      playerPaused: false,
    })).toBe('pause');
    expect(getBrowserPageAudioAction({
      visibilityState: 'hidden',
      pausedForPageBackground: true,
      playerPaused: false,
    })).toBe('none');
  });

  it('resumes when the game tab becomes visible again', () => {
    expect(getBrowserPageAudioAction({
      visibilityState: 'visible',
      pausedForPageBackground: true,
      playerPaused: false,
    })).toBe('resume');
  });

  it('preserves a player-requested pause after returning to the tab', () => {
    expect(getBrowserPageAudioAction({
      visibilityState: 'visible',
      pausedForPageBackground: true,
      playerPaused: true,
    })).toBe('release');
  });
});
