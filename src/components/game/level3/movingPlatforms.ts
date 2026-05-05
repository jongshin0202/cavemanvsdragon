// ============================================================
// Level 3 — moving platforms (Frogger-style)
// ------------------------------------------------------------
// Pass 1: a small overlay layer of horizontally-moving platforms
// that the player and monkeys can stand on. They are drawn on
// top of (and respect collision against) the static L2-style
// layout that L3 currently inherits. Pass 2 will replace the
// underlying static layout with the L3 sketch geometry.
// ============================================================

import { CANVAS_W } from '../constants';

export interface MovingPlatform {
  x: number;       // left edge
  y: number;       // top edge (collision surface)
  w: number;
  h: number;
  vx: number;      // pixels per frame; sign = direction
  minX: number;    // left bound of patrol
  maxX: number;    // right bound of patrol
}

let platforms: MovingPlatform[] = [];

export function getMovingPlatforms(): MovingPlatform[] { return platforms; }

/** (Re)build the L3 moving-platform layer. Call from initLevel3. */
export function buildLevel3MovingPlatforms(iteration: number): void {
  // Two rows of moving platforms at heights between the lower and middle
  // static layers. Speeds nudge up per L3 iteration.
  const speedMul = 1 + 0.10 * Math.max(0, iteration - 1);
  const pW = 64;
  const pH = 8;
  // Row A — y ≈ 268 (between P3 and P4 of the static layout)
  // Row B — y ≈ 332 (between P2 and P3)
  const rowA = 268;
  const rowB = 332;

  platforms = [
    { x: 32,  y: rowA, w: pW, h: pH, vx:  0.7 * speedMul, minX: 16,  maxX: CANVAS_W - 80 - 16 },
    { x: 320, y: rowA, w: pW, h: pH, vx: -0.9 * speedMul, minX: 16,  maxX: CANVAS_W - 80 - 16 },
    { x: 96,  y: rowB, w: pW, h: pH, vx: -1.0 * speedMul, minX: 16,  maxX: CANVAS_W - 80 - 16 },
    { x: 384, y: rowB, w: pW, h: pH, vx:  0.8 * speedMul, minX: 16,  maxX: CANVAS_W - 80 - 16 },
  ];
}

export function clearLevel3MovingPlatforms(): void { platforms = []; }

/** Tick the moving platforms — bounce at bounds. Returns the per-frame dx
 *  for each platform so the host can carry standing entities along with it. */
export function tickMovingPlatforms(): number[] {
  const dxs: number[] = [];
  for (const mp of platforms) {
    const oldX = mp.x;
    mp.x += mp.vx;
    if (mp.x < mp.minX) { mp.x = mp.minX; mp.vx = Math.abs(mp.vx); }
    else if (mp.x + mp.w > mp.maxX + mp.w) {
      // (use right-bound check: don't run off canvas)
    }
    if (mp.x + mp.w > CANVAS_W - 16) {
      mp.x = CANVAS_W - 16 - mp.w;
      mp.vx = -Math.abs(mp.vx);
    }
    dxs.push(mp.x - oldX);
  }
  return dxs;
}

/** Render the moving platforms (blue, like the static ones). */
export function renderMovingPlatforms(ctx: CanvasRenderingContext2D): void {
  for (const mp of platforms) {
    ctx.fillStyle = '#1f5fcf';
    ctx.fillRect(mp.x, mp.y, mp.w, mp.h);
    ctx.fillStyle = '#4a8ef0';
    ctx.fillRect(mp.x, mp.y, mp.w, 2);
    ctx.fillStyle = '#0e3e9e';
    ctx.fillRect(mp.x, mp.y + mp.h - 2, mp.w, 2);
    // direction arrow (subtle)
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const cx = mp.x + mp.w / 2;
    const cy = mp.y + mp.h / 2;
    if (mp.vx >= 0) {
      ctx.fillRect(cx, cy - 1, 6, 2);
      ctx.fillRect(cx + 4, cy - 2, 2, 4);
    } else {
      ctx.fillRect(cx - 6, cy - 1, 6, 2);
      ctx.fillRect(cx - 6, cy - 2, 2, 4);
    }
  }
}

/** Resolve player-vs-moving-platform collision. Mutates `p.y/vy/onGround`
 *  if landing. Returns the dx the player should be carried by (0 if not
 *  standing). Call AFTER the static-platform collision pass. */
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
