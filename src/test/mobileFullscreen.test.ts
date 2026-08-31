import { describe, expect, it, vi } from 'vitest';
import { requestMobileFullscreen } from '@/components/game/mobileFullscreen';

const makeDocument = (requestFullscreen?: () => Promise<void>) => ({
  fullscreenElement: null,
  documentElement: { requestFullscreen },
}) as unknown as Document;

describe('mobile fullscreen', () => {
  it('requests fullscreen for touch web after a user gesture', async () => {
    const requestFullscreen = vi.fn(async () => undefined);
    const result = await requestMobileFullscreen({
      isNativeApp: false,
      isTouchDevice: true,
      doc: makeDocument(requestFullscreen),
    });

    expect(result).toBe(true);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('does not request fullscreen for desktop or the APK', async () => {
    const requestFullscreen = vi.fn(async () => undefined);
    const doc = makeDocument(requestFullscreen);

    await requestMobileFullscreen({ isNativeApp: false, isTouchDevice: false, doc });
    await requestMobileFullscreen({ isNativeApp: true, isTouchDevice: true, doc });

    expect(requestFullscreen).not.toHaveBeenCalled();
  });
});
