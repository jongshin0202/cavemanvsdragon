type VibrationNavigator = Navigator & {
  webkitVibrate?: (pattern: number | number[]) => boolean | void;
};

export const CONTROL_HAPTIC_MIN_MS = 24;

/**
 * Requests a single vibration pulse from a mobile web browser.
 *
 * Keep this synchronous with the pointer/touch handler: Chromium requires a
 * user activation for vibration. Clear any stale pulse first, matching the
 * behavior that proved reliable on the original Android web controls.
 */
export const vibrateWebControl = (
  ms: number,
  nav: VibrationNavigator | null = typeof navigator !== 'undefined'
    ? (navigator as VibrationNavigator)
    : null,
): boolean => {
  if (!nav) return false;

  const vibrate = typeof nav.vibrate === 'function'
    ? nav.vibrate.bind(nav)
    : typeof nav.webkitVibrate === 'function'
      ? nav.webkitVibrate.bind(nav)
      : null;

  if (!vibrate) return false;

  const duration = Math.max(CONTROL_HAPTIC_MIN_MS, Math.round(ms));
  try {
    vibrate(0);
    return vibrate(duration) !== false;
  } catch {
    return false;
  }
};
