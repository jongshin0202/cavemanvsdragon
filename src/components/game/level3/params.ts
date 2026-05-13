// ============================================================
// Level 3 — tunable parameters
// ------------------------------------------------------------
// All speeds in pixels/frame (60 FPS). Per-platform speed is
// randomized in [min, max] at build time. Speeds scale up by
// `speedScalePerIter` each iteration of L3.
// ============================================================

export const LEVEL3_PARAMS = {
  // Bottom row (row 0): center is a STATIC island; one mover left,
  // one mover right. They bounce off the island and the screen edges.
  row0: {
    minSpeed: 0.4,
    maxSpeed: 1.2,
  },
  // Middle row (row 1 / "platform level 2"): slow LEFT→RIGHT.
  row1: {
    minSpeed: 0.5,
    maxSpeed: 0.7,
  },
  // Row 2 / "platform level 3": each platform picks its own speed in this
  // range so they spread apart naturally over time.
  row2: {
    minSpeed: 0.6,
    maxSpeed: 1.6,
  },
  // Top row (row 3 / "platform level 4"): fast LEFT→RIGHT.
  row3: {
    minSpeed: 1.5,
    maxSpeed: 1.8,
  },
  // Multiplicative speed bump per L3 iteration (iter 1 = 1.0).
  speedScalePerIter: 0.10,

  // Geometry
  platformWidth: 82,
  platformHeight: 8,

  // Starting # of moving platforms in each upper row at iter 1.
  // (Per-iteration the counts decrease — see getL3RowCounts below.)
  row1Count: 4,
  row2Count: 4,
  row3Count: 4,
};

export function l3IterSpeedMul(iteration: number): number {
  return 1 + LEVEL3_PARAMS.speedScalePerIter * Math.max(0, iteration - 1);
}

/** Per-iteration row counts. Iter 1 = [3,3,3]. Each iteration removes 1
 *  platform from the row with the highest count (so all rows stay within
 *  ±1 of each other). Minimum is 1 per row → floor at [1,1,1]. */
export function getL3RowCounts(iteration: number): [number, number, number] {
  const start = LEVEL3_PARAMS.row1Count
    + LEVEL3_PARAMS.row2Count
    + LEVEL3_PARAMS.row3Count;
  const removed = Math.max(0, iteration - 1);
  const total = Math.max(6, start - removed); // min 2 per row keeps Frogger lanes active
  const base = Math.floor(total / 3);
  const extra = total - base * 3;
  // Distribute leftover so highest-count rows are the LOWER rows first
  // (row1 gets extra before row2, etc.). Visually consistent with iter 1.
  const counts: [number, number, number] = [base, base, base];
  for (let i = 0; i < extra; i++) counts[i] += 1;
  return counts;
}

export function randInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
