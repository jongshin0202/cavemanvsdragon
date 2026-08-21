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
  if (isNativeApp) return 'none';

  if (isPaused && source === 'keyboard') return 'resume';
  if (!isPaused && source === 'keyboard' && key === 'Enter') return 'pause';
  if (!isPaused && source === 'keyboard' && key.toLowerCase() === 'r') return 'consume';

  return 'none';
}
