// ============================================================
// Level 3 — Frogger-style moving platforms (3 rows)
// ------------------------------------------------------------
// Row 0 (bottom): STATIC center island + 2 movers (one each side)
//                 bouncing off the island and screen edges.
// Row 1 (middle): all move LEFT, wrap from right with even pitch.
// Row 2 (top):    all move RIGHT, wrap from left with even pitch.
// Speeds are randomized per platform within configurable [min,max]
// ranges and scale up by iteration. See ./params.ts.
// ============================================================

import { CANVAS_W } from '../constants';
import { LEVEL3_PARAMS, l3IterSpeedMul, randInRange } from './params';

export type RowMode = 'bounce' | 'wrapLeft' | 'wrapRight' | 'static';

export interface MovingPlatform {
  x: number; y: number; w: number; h: number;
  vx: number;
  row: number;
  mode: RowMode;
}

let platforms: MovingPlatform[] = [];

export function getMovingPlatforms(): MovingPlatform[] { return platforms; }
export function clearLevel3MovingPlatforms(): void { platforms = []; }

// Bottom (row 0) → top (row 3). Spaced by ~36px so the player can jump
// row-to-row. Sprout platform is at y=176, split at y=304, so rows live
// between 432 and ~324.
const ROW_Y = [432, 396, 360, 324];
// Minimum gap between platforms in the SAME row (≈ jump distance, so two
// adjacent platforms can never overlap or touch — closest = jumpable).
const MIN_GAP = 50;

export function buildLevel3MovingPlatforms(iteration: number): void {
  const W = LEVEL3_PARAMS.platformWidth;
  const H = LEVEL3_PARAMS.platformHeight;
  const mul = l3IterSpeedMul(iteration);
  platforms = [];

  // ── Row 0: two bouncers, no center island — player can fall through.
  const leftSpawnX = (CANVAS_W * 0.25) - W / 2;
  platforms.push({
    x: Math.max(0, leftSpawnX), y: ROW_Y[0], w: W, h: H,
    vx: -randInRange(LEVEL3_PARAMS.row0.minSpeed, LEVEL3_PARAMS.row0.maxSpeed) * mul,
    row: 0, mode: 'bounce',
  });
  const rightSpawnX = (CANVAS_W * 0.75) - W / 2;
  platforms.push({
    x: Math.min(CANVAS_W - W, rightSpawnX), y: ROW_Y[0], w: W, h: H,
    vx: randInRange(LEVEL3_PARAMS.row0.minSpeed, LEVEL3_PARAMS.row0.maxSpeed) * mul,
    row: 0, mode: 'bounce',
  });

  // ── Row 1: wrap RIGHT (L → R)
  const r1n = LEVEL3_PARAMS.row1Count;
  const r1Pitch = CANVAS_W / r1n;
  for (let i = 0; i < r1n; i++) {
    platforms.push({
      x: i * r1Pitch + (r1Pitch - W) / 2,
      y: ROW_Y[1], w: W, h: H,
      vx: randInRange(LEVEL3_PARAMS.row1.minSpeed, LEVEL3_PARAMS.row1.maxSpeed) * mul,
      row: 1, mode: 'wrapRight',
    });
  }

  // ── Row 2: wrap LEFT (R → L)
  const r2n = LEVEL3_PARAMS.row2Count;
  const r2Pitch = CANVAS_W / r2n;
  for (let i = 0; i < r2n; i++) {
    platforms.push({
      x: i * r2Pitch + (r2Pitch - W) / 2,
      y: ROW_Y[2], w: W, h: H,
      vx: -randInRange(LEVEL3_PARAMS.row2.minSpeed, LEVEL3_PARAMS.row2.maxSpeed) * mul,
      row: 2, mode: 'wrapLeft',
    });
  }

  // ── Row 3: wrap RIGHT (L → R)
  const r3n = LEVEL3_PARAMS.row3Count;
  const r3Pitch = CANVAS_W / r3n;
  for (let i = 0; i < r3n; i++) {
    platforms.push({
      x: i * r3Pitch + (r3Pitch - W) / 2,
      y: ROW_Y[3], w: W, h: H,
      vx: randInRange(LEVEL3_PARAMS.row3.minSpeed, LEVEL3_PARAMS.row3.maxSpeed) * mul,
      row: 3, mode: 'wrapRight',
    });
  }
}

/** Tick: advance positions per row mode. Returns per-platform dx. */
export function tickMovingPlatforms(): number[] {
  const dxs: number[] = new Array(platforms.length).fill(0);

  const byRow: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [] };
  platforms.forEach((p, i) => { byRow[p.row].push(i); });

  // ── Row 0: bouncers vs walls AND vs the static island.
  const r0 = byRow[0];
  for (const i of r0) {
    const p = platforms[i];
    if (p.mode === 'static') continue;
    const oldX = p.x;
    p.x += p.vx;
    dxs[i] = p.x - oldX;
  }
  for (const i of r0) {
    const p = platforms[i];
    if (p.mode === 'static') continue;
    if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); }
    else if (p.x + p.w > CANVAS_W) { p.x = CANVAS_W - p.w; p.vx = -Math.abs(p.vx); }
  }
  for (let a = 0; a < r0.length; a++) {
    for (let b = a + 1; b < r0.length; b++) {
      const pa = platforms[r0[a]]; const pb = platforms[r0[b]];
      if (pa.x < pb.x + pb.w && pa.x + pa.w > pb.x) {
        const overlap = Math.min(pa.x + pa.w - pb.x, pb.x + pb.w - pa.x);
        const aStatic = pa.mode === 'static';
        const bStatic = pb.mode === 'static';
        if (aStatic && !bStatic) {
          if (pb.x < pa.x) { pb.x -= overlap; pb.vx = -Math.abs(pb.vx); }
          else { pb.x += overlap; pb.vx = Math.abs(pb.vx); }
        } else if (bStatic && !aStatic) {
          if (pa.x < pb.x) { pa.x -= overlap; pa.vx = -Math.abs(pa.vx); }
          else { pa.x += overlap; pa.vx = Math.abs(pa.vx); }
        } else if (!aStatic && !bStatic) {
          if (pa.x < pb.x) { pa.x -= overlap / 2; pb.x += overlap / 2; pa.vx = -Math.abs(pa.vx); pb.vx = Math.abs(pb.vx); }
          else { pa.x += overlap / 2; pb.x -= overlap / 2; pa.vx = Math.abs(pa.vx); pb.vx = -Math.abs(pb.vx); }
        }
      }
    }
  }

  // Generic wrap rows (1, 2, 3) — direction depends on mode.
  for (const rowIdx of [1, 2, 3]) {
    const r = byRow[rowIdx];
    if (!r || r.length === 0) continue;
    const pitch = CANVAS_W / r.length;
    for (const i of r) {
      const p = platforms[i];
      const oldX = p.x;
      p.x += p.vx;
      dxs[i] = p.x - oldX;
      if (p.mode === 'wrapRight' && p.x > CANVAS_W) {
        let minX = Infinity;
        for (const j of r) if (j !== i && platforms[j].x < minX) minX = platforms[j].x;
        p.x = minX - pitch;
      } else if (p.mode === 'wrapLeft' && p.x + p.w < 0) {
        let maxX = -Infinity;
        for (const j of r) if (j !== i && platforms[j].x > maxX) maxX = platforms[j].x;
        p.x = maxX + pitch;
      }
    }
    enforceMinSpacing(r);
  }

  return dxs;
}

/** Ensure platforms in a row never overlap and never get closer than
 *  MIN_GAP px. The trailing (right-most or left-most) platform is held
 *  back so it stays at least MIN_GAP behind the leader. */
function enforceMinSpacing(rowIdxs: number[]): void {
  if (rowIdxs.length < 2) return;
  // Sort by x ascending.
  const sorted = [...rowIdxs].sort((a, b) => platforms[a].x - platforms[b].x);
  for (let k = 1; k < sorted.length; k++) {
    const prev = platforms[sorted[k - 1]];
    const cur = platforms[sorted[k]];
    const minX = prev.x + prev.w + MIN_GAP;
    if (cur.x < minX) cur.x = minX;
  }
}

export function renderMovingPlatforms(ctx: CanvasRenderingContext2D): void {
  for (const mp of platforms) {
    if (mp.mode === 'static') {
      // Stone-island look so the player can tell it doesn't move.
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(mp.x, mp.y, mp.w, mp.h);
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(mp.x, mp.y, mp.w, 2);
      ctx.fillStyle = '#374151';
      ctx.fillRect(mp.x, mp.y + mp.h - 2, mp.w, 2);
      continue;
    }
    ctx.fillStyle = '#1f5fcf';
    ctx.fillRect(mp.x, mp.y, mp.w, mp.h);
    ctx.fillStyle = '#4a8ef0';
    ctx.fillRect(mp.x, mp.y, mp.w, 2);
    ctx.fillStyle = '#0e3e9e';
    ctx.fillRect(mp.x, mp.y + mp.h - 2, mp.w, 2);
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
