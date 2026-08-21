import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const musicAssets = [
  ['public/__l5e/assets-v1/81d122e4-f5a6-4c74-b218-ad496945acb1/Gamemusic1.mp3', 'e41405ce69103975ac5cc3f2a4bd869c44f294592b1f9b6590b1bc472805599b'],
  ['public/__l5e/assets-v1/07c06cb2-2107-41a3-9990-f3212851fe57/Gamemusic2.mp3', 'd17f83c3c6edd67e0d6472e7dfbf4b736942e69f115baf6cec7901b226e4859d'],
  ['public/__l5e/assets-v1/685f4432-28cf-481b-ad6f-40d5388eb747/Gamemusic3.mp3', '528a6a3079c80f2b76afb4956867176b09f25edf2571ab0d8995b1ea35dc36db'],
  ['public/__l5e/assets-v1/a6f66d24-ca19-4677-97af-60cd2eda8a89/Gamemusic4.mp3', '6b5e37f6bcdca34f36d892a8fac139d5b1cb4b7b73be8dfc77b2254429ed5008'],
  ['public/__l5e/assets-v1/9f6d1fe7-96b1-4f22-ac2d-43ddf020559c/Gamemusic_Ending.mp3', '1258639d398f0fcc6b14b73b1c300b2f2140b9197039af1853cf591ee05e0e4a'],
] as const;

describe('bundled V1.1 background music', () => {
  it.each(musicAssets)('%s matches the approved APK audio', (path, expectedHash) => {
    const bytes = readFileSync(resolve(process.cwd(), path));

    expect(bytes.byteLength).toBeGreaterThan(400_000);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(expectedHash);
  });

  it('keeps the approved mix and stereo-preserving routes in source', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/game/bgMusic.ts'),
      'utf8',
    );

    expect(source).toContain('volume: VOL');
    expect(source).toContain('volume: 0.238, htmlNativeLoop: true');
    expect(source).toContain('volume: 0.258, htmlNativeLoop: true');
    expect(source).toContain('volume: 0.217');
    expect(source).toContain('volume: 0.311');
    expect(source).toContain('if (t.htmlNativeLoop)');
    expect(source).toContain('t.a.loop = true');
  });
});
