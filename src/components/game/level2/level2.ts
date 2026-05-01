// ============================================================
// Level 2 — module entry
// ------------------------------------------------------------
// SCAFFOLD ONLY (stage 1).
// Provides `initLevel2`, `updateLevel2`, `renderLevel2` so the host
// can swap them in when round === 2 (or higher). Mechanics
// (jacketed monkeys, volcano, fireballs, holes, sprouts, cans,
// rock-seal, win) will be filled in across follow-up stages.
// All level-2 mutable state lives inside `L2State` — no level 1
// constants are mutated.
// ============================================================

import { CANVAS_W, CANVAS_H, PLATFORMS, getPlatformY } from '../constants';
import { LEVEL2_PARAMS } from './params';
import { L2State, makeEmptyL2State } from './types';

export interface L2Sprites {
  // Reused from Level 1 (host passes them in so we don't double-load)
  walk: HTMLImageElement | null;
  jump: HTMLImageElement | null;
  climb: HTMLImageElement | null;
  win: HTMLImageElement | null;
  dragonAngry: HTMLImageElement | null;
  dragonFire: HTMLImageElement | null;
  princess: HTMLImageElement | null;
  robot: HTMLImageElement | null;
  rockWheel: HTMLImageElement | null;
  wateringCan: HTMLImageElement | null;
}

/** Re-initialize for a new L2 round. Preserves `round` counter. */
export function initLevel2(s: L2State, round: number): void {
  const prev = s.round;
  Object.assign(s, makeEmptyL2State());
  s.round = round > 0 ? round : prev;
  s.initialized = true;
  // TODO (stage 2+): spawn monkeys, sprouts, position volcano, etc.
}

/**
 * One frame of level-2 logic. Returns true if the level was completed
 * this frame (host then plays the outro and advances).
 *
 * Stage-1 stub: draws the static layout only. The host's existing
 * player-movement code keeps running so the caveman can already walk
 * around inside the L2 scene while we add hazards in later stages.
 */
export function updateLevel2(_s: L2State, _frame: number): boolean {
  // Mechanics added in follow-up stages.
  return false;
}

/** Render the static Level 2 scene (background + platforms + volcano
 *  + dragon/princess slot). The host renders the player on top. */
export function renderLevel2(
  ctx: CanvasRenderingContext2D,
  s: L2State,
  sprites: L2Sprites,
): void {
  // Background — slightly hotter palette than L1 to feel volcanic
  ctx.fillStyle = '#1a0a08';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Platforms (blue beams to mirror the user's reference image)
  ctx.fillStyle = '#3b6cd1';
  for (let i = 0; i < PLATFORMS.length; i++) {
    const plat = PLATFORMS[i];
    const y0 = getPlatformY(plat, plat.x1);
    const y1 = getPlatformY(plat, plat.x2);
    const yTop = Math.min(y0, y1);
    ctx.fillRect(plat.x1, yTop, plat.x2 - plat.x1, 8);
  }

  // Volcano (green trapezoid) — sits on the TOP platform, right side
  const topPlat = PLATFORMS[PLATFORMS.length - 1];
  const volBaseY = getPlatformY(topPlat, topPlat.x2 - 60);
  const volBaseX = topPlat.x2 - 96;
  const volBaseW = 64;
  const volTopW = 36;
  const volH = 44;
  ctx.fillStyle = '#2fa84a';
  ctx.beginPath();
  ctx.moveTo(volBaseX, volBaseY);
  ctx.lineTo(volBaseX + volBaseW, volBaseY);
  ctx.lineTo(volBaseX + volBaseW - (volBaseW - volTopW) / 2, volBaseY - volH);
  ctx.lineTo(volBaseX + (volBaseW - volTopW) / 2, volBaseY - volH);
  ctx.closePath();
  ctx.fill();

  // Volcano sealed — draw a dark rock cap
  if (s.volcanoSealed) {
    ctx.fillStyle = '#444';
    ctx.fillRect(
      volBaseX + (volBaseW - volTopW) / 2,
      volBaseY - volH - 6,
      volTopW,
      8,
    );
  }

  // Holes in platforms (drawn as background-colored gaps)
  ctx.fillStyle = '#1a0a08';
  for (const h of s.holes) {
    const plat = PLATFORMS[h.platformIdx];
    const y = getPlatformY(plat, h.centerX);
    ctx.fillRect(h.centerX - h.width / 2, y - 1, h.width, 12);
  }
}

/**
 * Layout helpers exported so the host can use the same volcano /
 * princess positions for collision and rendering.
 */
export function getVolcanoMouth(): { x: number; y: number } {
  const topPlat = PLATFORMS[PLATFORMS.length - 1];
  const baseY = getPlatformY(topPlat, topPlat.x2 - 60);
  const x = topPlat.x2 - 96 + 32; // mid-volcano
  return { x, y: baseY - 44 };
}

export { LEVEL2_PARAMS };
