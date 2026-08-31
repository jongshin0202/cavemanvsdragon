import { describe, expect, it, vi } from 'vitest';
import { CONTROL_HAPTIC_MIN_MS, vibrateWebControl } from './controlHaptics';

describe('vibrateWebControl', () => {
  it('clears a stale vibration before pulsing an Android web control press', () => {
    const vibrate = vi.fn(() => true);

    expect(vibrateWebControl(45, { vibrate } as unknown as Navigator)).toBe(true);
    expect(vibrate).toHaveBeenCalledTimes(2);
    expect(vibrate).toHaveBeenNthCalledWith(1, 0);
    expect(vibrate).toHaveBeenNthCalledWith(2, 45);
  });

  it('uses a perceptible minimum pulse', () => {
    const vibrate = vi.fn(() => true);

    vibrateWebControl(5, { vibrate } as unknown as Navigator);

    expect(vibrate).toHaveBeenNthCalledWith(1, 0);
    expect(vibrate).toHaveBeenNthCalledWith(2, CONTROL_HAPTIC_MIN_MS);
  });

  it('falls back to the prefixed browser API when present', () => {
    const webkitVibrate = vi.fn(() => true);

    expect(vibrateWebControl(35, { webkitVibrate } as unknown as Navigator)).toBe(true);
    expect(webkitVibrate).toHaveBeenNthCalledWith(1, 0);
    expect(webkitVibrate).toHaveBeenNthCalledWith(2, 35);
  });

  it('does nothing when the browser exposes no vibration API', () => {
    expect(vibrateWebControl(45, {} as Navigator)).toBe(false);
  });
});
