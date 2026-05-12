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
  // Row 2 / "platform level 3": medium RIGHT→LEFT.
  row2: {
    minSpeed: 1.0,
    maxSpeed: 1.2,
  },
  // Top row (row 3 / "platform level 4"): fast LEFT→RIGHT.
  row3: {
    minSpeed: 1.5,
    maxSpeed: 1.8,
  },
  // Multiplicative speed bump per L3 iteration (iter 1 = 1.0).
  speedScalePerIter: 0.10,

  // Geometry
  platformWidth: 72,
  platformHeight: 8,

  // # of moving platforms in each upper row.
  row1Count: 3,
  row2Count: 3,
  row3Count: 3,
};

export function l3IterSpeedMul(iteration: number): number {
  return 1 + LEVEL3_PARAMS.speedScalePerIter * Math.max(0, iteration - 1);
}

export function randInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
