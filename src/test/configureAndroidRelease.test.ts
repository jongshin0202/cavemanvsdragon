import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('configure_android_release.py', () => {
  it('sets Version 1 metadata and release signing on generated Gradle', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cvd-android-release-'));
    const gradle = join(dir, 'build.gradle');
    writeFileSync(gradle, `android {
    defaultConfig {
        versionCode 1
        versionName "1.0"
    }
    buildTypes {
        release {
            minifyEnabled false
        }
    }
}\n`);

    execFileSync('python3', [
      'scripts/configure_android_release.py',
      '--gradle-file', gradle,
      '--version-code', '1',
      '--version-name', '1.0.0',
    ]);

    const result = readFileSync(gradle, 'utf8');
    expect(result).toContain('versionCode 1');
    expect(result).toContain('versionName "1.0.0"');
    expect(result).toContain('signingConfigs {');
    expect(result).toContain('signingConfig signingConfigs.release');
    expect(result).toContain('CVD_UPLOAD_KEYSTORE_PATH');
  });
});
