import { afterEach, describe, expect, it, vi } from 'vitest';

class FakeAudioNode {
  connect = vi.fn();
}

class FakeGainNode extends FakeAudioNode {
  gain = {
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

class FakeOscillatorNode extends FakeAudioNode {
  type = 'sine';
  frequency = {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  start = vi.fn();
  stop = vi.fn();
}

const createdGains: FakeGainNode[] = [];

class FakeAudioContext {
  currentTime = 0;
  state = 'running';
  destination = new FakeAudioNode();
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });

  createGain() {
    const gain = new FakeGainNode();
    createdGains.push(gain);
    return gain;
  }

  createOscillator() {
    return new FakeOscillatorNode();
  }
}

const createdContexts: FakeAudioContext[] = [];
class TrackedFakeAudioContext extends FakeAudioContext {
  constructor() {
    super();
    createdContexts.push(this);
  }
}

async function initializeSfx({
  native = false,
  touchPoints,
  width,
  height,
}: {
  native?: boolean;
  touchPoints: number;
  width: number;
  height: number;
}) {
  vi.resetModules();
  createdGains.length = 0;
  createdContexts.length = 0;
  vi.doMock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => native },
  }));
  vi.stubGlobal('AudioContext', TrackedFakeAudioContext);
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: touchPoints });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });

  const { playJumpSound } = await import('./sounds');
  playJumpSound();
  return createdGains[0];
}

afterEach(() => {
  vi.doUnmock('@capacitor/core');
  vi.unstubAllGlobals();
});

describe('phone SFX output gain', () => {
  it('boosts sound effects on a web phone', async () => {
    const output = await initializeSfx({ touchPoints: 5, width: 844, height: 390 });
    expect(output.gain.value).toBe(2.4);
    expect(createdGains[1].gain.setValueAtTime).toHaveBeenCalledWith(0.24375, 0);
  });

  it('resumes a suspended native SFX context before the next level sound', async () => {
    await initializeSfx({ native: true, touchPoints: 5, width: 844, height: 390 });
    const context = createdContexts[0];
    context.state = 'suspended';
    const { playJumpSound } = await import('./sounds');

    playJumpSound();

    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.state).toBe('running');
  });

  it('suspends native SFX when Android enters the background', async () => {
    await initializeSfx({ native: true, touchPoints: 5, width: 844, height: 390 });
    const context = createdContexts[0];
    const { pauseBrowserSfx } = await import('./sounds');

    await pauseBrowserSfx();

    expect(context.suspend).toHaveBeenCalledTimes(1);
    expect(context.state).toBe('suspended');
  });

  it('keeps desktop web sound effects unchanged', async () => {
    const output = await initializeSfx({ touchPoints: 0, width: 1440, height: 900 });
    expect(output.gain.value).toBe(1);
    expect(createdGains[1].gain.setValueAtTime).toHaveBeenCalledWith(0.15, 0);
  });

  it('gives the Android APK the same SFX mix as the phone website', async () => {
    const output = await initializeSfx({ native: true, touchPoints: 5, width: 844, height: 390 });
    expect(output.gain.value).toBe(2.4);
    expect(createdGains[1].gain.setValueAtTime).toHaveBeenCalledWith(0.24375, 0);
  });
});
