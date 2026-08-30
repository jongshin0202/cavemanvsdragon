type BrowserGameplayPauseAction = 'pause' | 'resume' | 'consume' | 'none';
export type BrowserPageAudioAction = 'pause' | 'resume' | 'release' | 'none';

interface BrowserGameplayPauseInput {
  isNativeApp: boolean;
  isPaused: boolean;
  key: string;
  source: 'keyboard' | 'pad';
}

export function getBrowserGameplayPauseAction({
  isNativeApp,
  isPaused,
  key,
  source,
}: BrowserGameplayPauseInput): BrowserGameplayPauseAction {
  // Both the Android bridge and browser Gamepad API normalize the physical
  // controller's START button to this shared action.
  if (source === 'pad' && key === 'Start') {
    return isPaused ? 'resume' : 'pause';
  }

  if (isNativeApp) return 'none';

  if (isPaused && source === 'keyboard') return 'resume';
  if (!isPaused && source === 'keyboard' && key === 'Enter') return 'pause';
  if (!isPaused && source === 'keyboard' && key.toLowerCase() === 'r') return 'consume';

  return 'none';
}

interface BrowserPageAudioInput {
  visibilityState: DocumentVisibilityState;
  pausedForPageBackground: boolean;
  playerPaused: boolean;
}

export function getBrowserPageAudioAction({
  visibilityState,
  pausedForPageBackground,
  playerPaused,
}: BrowserPageAudioInput): BrowserPageAudioAction {
  if (visibilityState === 'hidden') {
    return pausedForPageBackground ? 'none' : 'pause';
  }
  if (!pausedForPageBackground) return 'none';
  return playerPaused ? 'release' : 'resume';
}
