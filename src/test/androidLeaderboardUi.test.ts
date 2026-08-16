import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const gameSource = readFileSync(
  new URL('../components/CavemanVsDragonGame.tsx', import.meta.url),
  'utf8',
);
const androidWorkflow = readFileSync(
  new URL('../../.github/workflows/android-build.yml', import.meta.url),
  'utf8',
);

describe('Android leaderboard UI regression guards', () => {
  it('always offers a touch submit action and an Android IME Go action', () => {
    expect(gameSource).toContain("['6','7','8','9','SPACE','DEL','GO']");
    expect(gameSource).toContain("if (token === 'GO')");
    expect(gameSource).toContain('enterKeyHint="go"');
  });

  it('shows touch controls only during active gameplay', () => {
    expect(gameSource).toContain(
      "!gamepadActive && gameState === 'playing'",
    );
    expect(androidWorkflow).toContain(
      "!controllerPresent && gameState === 'playing'",
    );
  });

  it('keeps the native title, local leaderboard, and global leaderboard attract cycle enabled', () => {
    expect(gameSource).not.toContain(
      "if (isNativeApp) return;\n\n    let nextState: GameState | null = null;",
    );
    expect(androidWorkflow).toContain("'APK attract rotation enabled'");
    expect(androidWorkflow).not.toContain(
      'remain on title until explicit input',
    );
  });
});
