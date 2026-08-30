import { describe, expect, it } from 'vitest';
import {
  shouldAllowSystemNameKeyboard,
  shouldUseLandscapeTouchLayout,
} from '@/components/game/touchUi';

describe('touch UI routing', () => {
  it('uses side controls for a landscape touch phone when controls are visible', () => {
    expect(shouldUseLandscapeTouchLayout({
      controlsVisible: true,
      isLandscape: true,
      isTablet: false,
    })).toBe(true);
  });

  it('does not use side controls in portrait, on tablets, or when a controller hides controls', () => {
    expect(shouldUseLandscapeTouchLayout({ controlsVisible: true, isLandscape: false, isTablet: false })).toBe(false);
    expect(shouldUseLandscapeTouchLayout({ controlsVisible: true, isLandscape: true, isTablet: true })).toBe(false);
    expect(shouldUseLandscapeTouchLayout({ controlsVisible: false, isLandscape: true, isTablet: false })).toBe(false);
  });

  it('never opens the system name keyboard in the native app or with a controller', () => {
    expect(shouldAllowSystemNameKeyboard({ isNativeApp: true, gamepadActive: false })).toBe(false);
    expect(shouldAllowSystemNameKeyboard({ isNativeApp: false, gamepadActive: true })).toBe(false);
    expect(shouldAllowSystemNameKeyboard({ isNativeApp: false, gamepadActive: false })).toBe(true);
  });
});
