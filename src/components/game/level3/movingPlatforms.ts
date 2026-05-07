// ============================================================
// Level 3 — Frogger-style moving platforms (3 rows)
// ------------------------------------------------------------
// Row 1 (bottom): bidirectional, bounce off each other AND walls.
// Row 2 (middle): all move LEFT continuously, wrap from right
//                  with even spacing.
// Row 3 (top):    all move RIGHT continuously, wrap from left
//                  with even spacing.
// All rows positioned so the player can jump from ground → row1
// → row2 → row3 → P3 (mid split platform at y=304).
// ============================================================

import { CANVAS_W } from '../constants';

export type RowMode = 'bounce' | 'wrapLeft' | 'wrapRight';

export interface MovingPlatform {
  x: number; y: number; w: number; h: number;
  vx: number;
  row: number;       // 0 = bottom (bounce), 1 = mid (wrapLeft), 2 = top (wrapRight)
  mode: RowMode;
}

let platforms: MovingPlatform[] = [];

export function getMovingPlatforms(): MovingPlatform[] { return platforms; }
export function clearLevel3MovingPlatforms(): void { platforms = []; }

const PLAT_W = 72;
const PLAT_H = 8;
const ROW_Y = [400, 360, 324]; // bottom → top; reachable jumps (~32-32-20-20 px)

export function buildLevel3MovingPlatforms(iteration: number): void {
  const speedMul = 1 + 0.10 * Math.max(0, iteration - 1);
  platforms = [];

  // Row 0 (bottom): bouncing — 3 platforms, alternating directions.
  const r0Count = 3;
  const r0Spacing = (CANVAS_W - r0Count * PLAT_W) / (r0Count + 1);
  for (let i = 0; i < r0Count; i++) {
    const x = r0Spacing + i * (PLAT_W + r0Spacing);
    platforms.push({
      x, y: ROW_Y[0], w: PLAT_W, h: PLAT_H,
      vx: (i % 2 === 0 ? 0.8 : -0.8) * speedMul,
      row: 0, mode: 'bounce',
    });
  }

  // Row 1 (middle): wrap LEFT — 3 platforms, evenly spaced.
  const r1Count = 3;
  const r1Pitch = CANVAS_W / r1Count;
  for (let i = 0; i < r1Count; i++) {
    platforms.push({
      x: i * r1Pitch + (r1Pitch - PLAT_W) / 2,
      y: ROW_Y[1], w: PLAT_W, h: PLAT_H,
      vx: -1.0 * speedMul,
      row: 1, mode: 'wrapLeft',
    });
  }

  // Row 2 (top): wrap RIGHT — 3 platforms, evenly spaced.
  const r2Count = 3;
  const r2Pitch = CANVAS_W / r2Count;
  for (let i = 0; i < r2Count; i++) {
    platforms.push({
      x: i * r2Pitch + (r2Pitch - PLAT_W) / 2,
      y: ROW_Y[2], w: PLAT_W, h: PLAT_H,
      vx: 1.0 * speedMul,
      row: 2, mode: 'wrapRight',
    });
  }
}

/** Tick: advance positions per row mode. Returns per-platform dx. */
export function tickMovingPlatforms(): number[] {
  const dxs: number[] = new Array(platforms.length).fill(0);

  // Group by row.
  const byRow: Record<number, number[]> = { 0: [], 1: [], 2: [] };
  platforms.forEach((p, i) => { byRow[p.row].push(i); });

  // ── Row 0: bounce off walls and off neighbors.
  const r0 = byRow[0];
  // first move
  for (const i of r0) {
    const oldX = platforms[i].x;
    platforms[i].x += platforms[i].vx;
    dxs[i] = platforms[i].x - oldX;
  }
  // wall bounce
  for (const i of r0) {
    const p = platforms[i];
    if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); }
    else if (p.x + p.w > CANVAS_W) { p.x = CANVAS_W - p.w; p.vx = -Math.abs(p.vx); }
  }
  // neighbor bounce (pairwise)
  for (let a = 0; a < r0.length; a++) {
    for (let b = a + 1; b < r0.length; b++) {
      const pa = platforms[r0[a]]; const pb = platforms[r0[b]];
      if (pa.x < pb.x + pb.w && pa.x + pa.w > pb.x) {
        // overlap → push apart and swap directions
        const overlap = Math.min(pa.x + pa.w - pb.x, pb.x + pb.w - pa.x);
        if (pa.x < pb.x) { pa.x -= overlap / 2; pb.x += overlap / 2; }
        else             { pa.x += overlap / 2; pb.x -= overlap / 2; }
        // ensure they move apart
        if (pa.x < pb.x) { pa.vx = -Math.abs(pa.vx); pb.vx = Math.abs(pb.vx); }
        else             { pa.vx = Math.abs(pa.vx);  pb.vx = -Math.abs(pb.vx); }
      }
    }
  }

  // ── Row 1: wrap LEFT (continuous). When fully off left, reappear on right
  //   maintaining even spacing relative to its row siblings.
  const r1 = byRow[1];
  for (const i of r1) {
    const p = platforms[i];
    const oldX = p.x;
    p.x += p.vx;
    dxs[i] = p.x - oldX;
    if (p.x + p.w < 0) {
      // place to the right of the rightmost sibling, with even pitch.
      const pitch = CANVAS_W / r1.length;
      let maxX = -Infinity;
      for (const j of r1) if (j !== i && platforms[j].x > maxX) maxX = platforms[j].x;
      p.x = maxX + pitch;
    }
  }

  // ── Row 2: wrap RIGHT.
  const r2 = byRow[2];
  for (const i of r2) {
    const p = platforms[i];
    const oldX = p.x;
    p.x += p.vx;
    dxs[i] = p.x - oldX;
    if (p.x > CANVAS_W) {
      const pitch = CANVAS_W / r2.length;
      let minX = Infinity;
      for (const j of r2) if (j !== i && platforms[j].x < minX) minX = platforms[j].x;
      p.x = minX - pitch;
    }
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
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
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
