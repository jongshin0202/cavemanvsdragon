import { describe, expect, it, vi } from 'vitest';
import { CONTROL_HAPTIC_MIN_MS, vibrateWebControl } from './controlHaptics';

describe('vibrateWebControl', () => {
  it('sends one vibration request for an Android web control press', () => {
    const vibrate = vi.fn(() => true);

    expect(vibrateWebControl(45, { vibrate } as unknown as Navigator)).toBe(true);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith([45]);
  });

  it('uses a perceptible minimum pulse', () => {
    const vibrate = vi.fn(() => true);

    vibrateWebControl(5, { vibrate } as unknown as Navigator);

    expect(vibrate).toHaveBeenCalledWith([CONTROL_HAPTIC_MIN_MS]);
  });

  it('falls back to the prefixed browser API when present', () => {
    const webkitVibrate = vi.fn(() => true);

    expect(vibrateWebControl(35, { webkitVibrate } as unknown as Navigator)).toBe(true);
    expect(webkitVibrate).toHaveBeenCalledWith([35]);
  });

  it('does nothing when the browser exposes no vibration API', () => {
    expect(vibrateWebControl(45, {} as Navigator)).toBe(false);
  });
});
