// ============================================================
// Level 3 — Frogger-style moving platforms
// ------------------------------------------------------------
// Two rows live BETWEEN P3 (y=304) and the small floating P1 (y=388).
// Players (and monkeys) can stand and ride them.
// ============================================================

import { CANVAS_W } from '../constants';

export interface MovingPlatform {
  x: number; y: number; w: number; h: number;
  vx: number; minX: number; maxX: number;
}

let platforms: MovingPlatform[] = [];

export function getMovingPlatforms(): MovingPlatform[] { return platforms; }
export function clearLevel3MovingPlatforms(): void { platforms = []; }

export function buildLevel3MovingPlatforms(iteration: number): void {
  const speedMul = 1 + 0.10 * Math.max(0, iteration - 1);
  const pW = 64;
  const pH = 8;
  const rowA = 336; // upper row
  const rowB = 372; // lower row
  platforms = [
    { x: 16,  y: rowA, w: pW, h: pH, vx:  0.7 * speedMul, minX: 0, maxX: CANVAS_W },
    { x: 220, y: rowA, w: pW, h: pH, vx:  0.7 * speedMul, minX: 0, maxX: CANVAS_W },
    { x: 420, y: rowA, w: pW, h: pH, vx:  0.7 * speedMul, minX: 0, maxX: CANVAS_W },
    { x: 96,  y: rowB, w: pW, h: pH, vx: -0.9 * speedMul, minX: 0, maxX: CANVAS_W },
    { x: 320, y: rowB, w: pW, h: pH, vx: -0.9 * speedMul, minX: 0, maxX: CANVAS_W },
  ];
}

/** Tick: bounce at canvas bounds. Returns per-frame dx for each platform. */
export function tickMovingPlatforms(): number[] {
  const dxs: number[] = [];
  for (const mp of platforms) {
    const oldX = mp.x;
    mp.x += mp.vx;
    if (mp.x < 8) { mp.x = 8; mp.vx = Math.abs(mp.vx); }
    else if (mp.x + mp.w > CANVAS_W - 8) { mp.x = CANVAS_W - 8 - mp.w; mp.vx = -Math.abs(mp.vx); }
    dxs.push(mp.x - oldX);
  }
  return dxs;
}

export function renderMovingPlatforms(ctx: CanvasRenderingContext2D): void {
  for (const mp of platforms) {
    ctx.fillStyle = '#1f5fcf';
    ctx.fillRect(mp.x, mp.y, mp.w, mp.h);
    ctx.fillStyle = '#4a8ef0';
    ctx.fillRect(mp.x, mp.y, mp.w, 2);
    ctx.fillStyle = '#0e3e9e';
    ctx.fillRect(mp.x, mp.y + mp.h - 2, mp.w, 2);
    // direction arrow
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const cx = mp.x + mp.w / 2;
    const cy = mp.y + mp.h / 2;
    if (mp.vx >= 0) { ctx.fillRect(cx, cy - 1, 6, 2); ctx.fillRect(cx + 4, cy - 2, 2, 4); }
    else { ctx.fillRect(cx - 6, cy - 1, 6, 2); ctx.fillRect(cx - 6, cy - 2, 2, 4); }
  }
}

/** Resolve player-vs-moving-platform landing. Returns dx to carry the player. */
export function landOnMovingPlatform(
  p: { x: number; y: number; w: number; h: number; vy: number; onGround: boolean; jumping: boolean },
  dxs: number[],
): number {
  let carry = 0;
  for (let i = 0; i < platforms.length; i++) {
    const mp = platforms[i];
    if (p.x + p.w > mp.x && p.x < mp.x + mp.w) {
      const surfaceY = mp.y;
      if (p.y + p.h >= surfaceY && p.y + p.h <= surfaceY + 12 && p.vy >= 0) {
        p.y = surfaceY - p.h;
        p.vy = 0;
        p.onGround = true;
        p.jumping = false;
        carry = dxs[i] || 0;
      }
    }
  }
  return carry;
}
