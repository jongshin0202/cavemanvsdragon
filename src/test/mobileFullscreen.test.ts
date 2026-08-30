import { describe, expect, it, vi } from 'vitest';
import { requestMobileLandscapeFullscreen } from '@/components/game/mobileFullscreen';

const makeDocument = (requestFullscreen?: () => Promise<void>) => ({
  fullscreenElement: null,
  documentElement: { requestFullscreen },
}) as unknown as Document;

describe('mobile landscape fullscreen', () => {
  it('requests fullscreen for landscape touch web after a user gesture', async () => {
    const requestFullscreen = vi.fn(async () => undefined);
    const result = await requestMobileLandscapeFullscreen({
      isNativeApp: false,
      isTouchDevice: true,
      isLandscape: true,
      doc: makeDocument(requestFullscreen),
    });

    expect(result).toBe(true);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('does not request fullscreen for desktop, portrait, or the APK', async () => {
    const requestFullscreen = vi.fn(async () => undefined);
    const doc = makeDocument(requestFullscreen);

    await requestMobileLandscapeFullscreen({ isNativeApp: false, isTouchDevice: false, isLandscape: true, doc });
    await requestMobileLandscapeFullscreen({ isNativeApp: false, isTouchDevice: true, isLandscape: false, doc });
    await requestMobileLandscapeFullscreen({ isNativeApp: true, isTouchDevice: true, isLandscape: true, doc });

    expect(requestFullscreen).not.toHaveBeenCalled();
  });
});
