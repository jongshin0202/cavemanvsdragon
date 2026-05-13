// ============================================================
// Level 3 — tunable parameters
// ------------------------------------------------------------
// All speeds in pixels/frame (60 FPS). Per-platform speed is
// randomized in [min, max] at build time. Speeds scale up by
// `speedScalePerIter` each iteration of L3.
// ============================================================

export const LEVEL3_PARAMS = {
  // Iter 1 baseline speeds — kept slow so the player can ease into the
  // Frogger lanes. +10% per iteration via `l3IterSpeedMul`.
  row0: {
    minSpeed: 0.198,
    maxSpeed: 0.495,
  },
  row1: {
    minSpeed: 0.22,
    maxSpeed: 0.33,
  },
  row2: {
    minSpeed: 0.275,
    maxSpeed: 0.605,
  },
  row3: {
    minSpeed: 0.495,
    maxSpeed: 0.715,
  },
  // Multiplicative speed bump per L3 iteration (iter 1 = 1.0).
  speedScalePerIter: 0.10,

  // Geometry
  platformWidth: 82,
  platformHeight: 8,

  // Number of moving platforms PER ROW (all 4 platform-levels share this).
  // Tunable per the redesign — default 2.
  MPS_PER_ROW: 2,

  // ── Top-platform monkeys (TP)
  TP_MONKEYS_BASE: 2,                   // monkeys at start, iter 1
  TP_MONKEY_SPEED_SCALE_PER_ITER: 0.10, // +10%/iter
  APPLE_SPEED_SCALE_PER_ITER: 0.10,     // +10%/iter

  // ── Wave respawn (Stage D)
  RESPAWN_MIN_MS: 3000,
  RESPAWN_MAX_MS: 5000,

  // ── Bat-swing (when MC is in sprout section)
  BAT_SWING_FRAMES: 18,
  BAT_COOLDOWN_FRAMES: 10,
  BAT_REACH_PX: 22,

  // (Deprecated — kept for back-compat with getL3RowCounts callers.)
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

/** Per-iteration MPS monkey distribution across the 4 moving-platform
 *  levels (rows 0..3 → MPL 1..4). Iter 1 = [0,1,0,1]: one monkey on
 *  MPL 2 and one on MPL 4. From iter 2 each iteration adds 1 monkey to
 *  the MPL with the lowest current count (max 3 per MPL, hard cap 12). */
export function getL3MpsMonkeyCounts(iteration: number): [number, number, number, number] {
  const counts: [number, number, number, number] = [0, 1, 0, 1];
  const cap = 3;
  const totalCap = cap * 4;
  let total = counts.reduce((a, b) => a + b, 0);
  const target = Math.min(totalCap, total + Math.max(0, iteration - 1));
  while (total < target) {
    let min = Infinity;
    for (let i = 0; i < 4; i++) if (counts[i] < cap && counts[i] < min) min = counts[i];
    const cands: number[] = [];
    for (let i = 0; i < 4; i++) if (counts[i] === min && counts[i] < cap) cands.push(i);
    if (cands.length === 0) break;
    counts[cands[Math.floor(Math.random() * cands.length)]]++;
    total++;
  }
  return counts;
}

export function randInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
