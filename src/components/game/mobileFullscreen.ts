interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface MobileFullscreenOptions {
  isNativeApp: boolean;
  isTouchDevice: boolean;
  isLandscape: boolean;
  doc?: FullscreenDocument;
}

export async function requestMobileLandscapeFullscreen({
  isNativeApp,
  isTouchDevice,
  isLandscape,
  doc = document as FullscreenDocument,
}: MobileFullscreenOptions): Promise<boolean> {
  if (isNativeApp || !isTouchDevice || !isLandscape) return false;
  if (doc.fullscreenElement || doc.webkitFullscreenElement) return true;

  const root = doc.documentElement as FullscreenElement;
  const request = root.requestFullscreen?.bind(root)
    ?? root.webkitRequestFullscreen?.bind(root);
  if (!request) return false;

  try {
    await request();
    return true;
  } catch {
    // Fullscreen is optional and can be denied by browser/user policy.
    return false;
  }
}
