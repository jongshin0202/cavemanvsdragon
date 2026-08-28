type BrowserGameplayPauseAction = 'pause' | 'resume' | 'consume' | 'none';

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
  // The Android bridge reports the physical controller's START button using
  // the pad source. START toggles pause in native gameplay; it must not be
  // ignored just because the browser Gamepad path is disabled in the APK.
  if (isNativeApp) {
    return source === 'pad' && key === 'Start'
      ? (isPaused ? 'resume' : 'pause')
      : 'none';
  }

  if (isPaused && source === 'keyboard') return 'resume';
  if (!isPaused && source === 'keyboard' && key === 'Enter') return 'pause';
  if (!isPaused && source === 'keyboard' && key.toLowerCase() === 'r') return 'consume';

  return 'none';
}
