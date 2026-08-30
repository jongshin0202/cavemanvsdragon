export function shouldUseLandscapeTouchLayout(options: {
  controlsVisible: boolean;
  isLandscape: boolean;
  isTablet: boolean;
}): boolean {
  return options.controlsVisible && options.isLandscape && !options.isTablet;
}

export function shouldAllowSystemNameKeyboard(options: {
  isNativeApp: boolean;
  gamepadActive: boolean;
}): boolean {
  return !options.isNativeApp && !options.gamepadActive;
}
