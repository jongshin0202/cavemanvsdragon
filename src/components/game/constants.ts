export const CANVAS_W = 512;
export const CANVAS_H = 480;
export const TILE = 16;
export const GRAVITY = 0.38;
export const JUMP_FORCE = -8;
export const MOVE_SPEED = 1.9;
export const BARREL_SPEED = 0.9;
export const CLIMB_SPEED = 1.5;
export const ROBOT_SPEED = 0.55;

// ============================================================
// DIFFICULTY (per-round scaling)
// ------------------------------------------------------------
// Round 1 = "much easier than current" (~50% of previous values).
// Each completed round → +10% harder (gentle ramp).
// Monkey count: starts at base, +1 every 2 rounds (cap at 6).
// Tweak these constants to rebalance.
// ============================================================
export const DIFFICULTY = {
  // Round 1 baseline
  base: {
    barrelSpawnMin: 208,        // frames → ~3.5s
    barrelSpawnRange: 414,      // frames → up to ~10.4s total
    barrelSpeedMul: 0.5,        // multiplier on BARREL_SPEED
    barrelSpeedJitter: 0.4,     // random extra (0..jitter) added to mul
    monkeyCount: 2,             // round-1 monkey count
    monkeySpeedMul: 0.5,        // multiplier on ROBOT_SPEED
    monkeySpeedJitter: 0.4,
  },
  // Monkey count: +1 per finished round, distributed across P2..P5.
  // Caps at 5 per platform (20 total).
  monkeyPlatforms: 4,
  monkeyPerPlatformCap: 5,
  monkeyTotalCap: 20,           // 4 platforms × 5
  // Wheel speed: +10% per finished round until monkey cap is reached,
  // then +20% per finished round afterward.
  barrelSpeedScalePerRound: 0.10,
  barrelSpeedScalePerRoundAfterCap: 0.20,
  // Wheel spawn frequency: unchanged until monkey cap is reached,
  // then spawn intervals shrink by 10% per finished round.
  barrelSpawnScalePerRoundAfterCap: 0.10,
  // Monkey speed continues to scale gently each round.
  monkeySpeedScalePerRound: 0.10,
};

// Round at which the monkey count cap (20) is first reached.
// Start at 2 monkeys (round 1) and add 1 per round → 20 monkeys at round 19.
export const MONKEY_CAP_ROUND =
  DIFFICULTY.monkeyTotalCap - DIFFICULTY.base.monkeyCount + 1; // = 19

export function getRoundDifficulty(round: number) {
  const r = Math.max(1, round);
  const steps = r - 1;

  // Wheel speed: +10% per round up to cap, then +20% per round after.
  const stepsBeforeCap = Math.min(steps, MONKEY_CAP_ROUND - 1);
  const stepsAfterCap = Math.max(0, steps - (MONKEY_CAP_ROUND - 1));
  const barrelSpeedFactor =
    1 +
    DIFFICULTY.barrelSpeedScalePerRound * stepsBeforeCap +
    DIFFICULTY.barrelSpeedScalePerRoundAfterCap * stepsAfterCap;

  // Wheel spawn frequency: only ramps after monkey cap is reached.
  const spawnHarder = 1 + DIFFICULTY.barrelSpawnScalePerRoundAfterCap * stepsAfterCap;
  const spawnEasier = 1 / spawnHarder;

  const monkeyHarder = 1 + DIFFICULTY.monkeySpeedScalePerRound * steps;

  const b = DIFFICULTY.base;
  const monkeyCount = Math.min(
    DIFFICULTY.monkeyTotalCap,
    b.monkeyCount + steps,
  );

  return {
    round: r,
    barrelSpawnMin: Math.max(20, b.barrelSpawnMin * spawnEasier),
    barrelSpawnRange: Math.max(20, b.barrelSpawnRange * spawnEasier),
    barrelSpeedMul: b.barrelSpeedMul * barrelSpeedFactor,
    barrelSpeedJitter: b.barrelSpeedJitter,
    monkeyCount,
    monkeySpeedMul: b.monkeySpeedMul * monkeyHarder,
    monkeySpeedJitter: b.monkeySpeedJitter,
  };
}

// Build per-platform monkey distribution for P2..P5 (indices 1..4 in PLATFORMS).
// Starts at [1,1,0,0] (round 1, total=2). Each subsequent round adds 1 monkey
// to a random platform that currently has the minimum count, until every
// platform has 5 (total 20). After that, distribution stays at [5,5,5,5].
export function buildMonkeyDistribution(round: number): number[] {
  const slots = DIFFICULTY.monkeyPlatforms;
  const counts = new Array<number>(slots).fill(0);
  const total = Math.min(
    DIFFICULTY.monkeyTotalCap,
    DIFFICULTY.base.monkeyCount + Math.max(0, round - 1),
  );
  for (let added = 0; added < total; added++) {
    // Find platforms with the minimum count that still have capacity.
    let min = Infinity;
    for (let i = 0; i < slots; i++) {
      if (counts[i] < DIFFICULTY.monkeyPerPlatformCap && counts[i] < min) {
        min = counts[i];
      }
    }
    const candidates: number[] = [];
    for (let i = 0; i < slots; i++) {
      if (counts[i] === min && counts[i] < DIFFICULTY.monkeyPerPlatformCap) {
        candidates.push(i);
      }
    }
    if (candidates.length === 0) break;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    counts[pick]++;
  }
  return counts;
}

export interface Rect { x: number; y: number; w: number; h: number }
export interface Barrel extends Rect { vx: number; vy: number; onLadder: boolean; falling: boolean; targetLadder: number | null; speed: number; rollPhase?: number; jumpedOver?: boolean }
export interface Robot extends Rect { vx: number; vy: number; onGround: boolean; climbing: boolean; targetLadder: number | null; direction: number; frame: number; frameTimer: number; speed: number }

// Platform definitions (y, xStart, xEnd)
// P1=ground, P2, P3, P4, P5, Top
// "tilting up L→R" = right side higher = slope < 0 (y decreases going right)
export const PLATFORMS: { y: number; x1: number; x2: number; slope?: number }[] = [
  { y: 432, x1: 0, x2: 512, slope: -0.02 },            // P1: full width
  { y: 368, x1: 0, x2: 464, slope: 0.02 },              // P2: gap on right for barrel drop
  { y: 304, x1: 48, x2: 512, slope: -0.02 },            // P3: gap on left for barrel drop
  { y: 240, x1: 0, x2: 464, slope: 0.02 },              // P4: gap on right for barrel drop
  { y: 176, x1: 48, x2: 512, slope: -0.02 },            // P5: gap on left for barrel drop
  { y: 112, x1: 0, x2: 432, slope: 0.02 },              // Top (P6): left edge extended to leftmost; gap on right
];

// Ladders: alternating/staggered positions between levels
export const LADDERS: { x: number; yTop: number; yBot: number }[] = [
  { x: 120, yTop: 368, yBot: 432 },   // P1 → P2
  { x: 360, yTop: 368, yBot: 432 },   // P1 → P2
  { x: 240, yTop: 304, yBot: 368 },   // P2 → P3
  { x: 440, yTop: 304, yBot: 368 },   // P2 → P3
  { x: 100, yTop: 240, yBot: 304 },   // P3 → P4
  { x: 340, yTop: 240, yBot: 304 },   // P3 → P4
  { x: 220, yTop: 176, yBot: 240 },   // P4 → P5
  { x: 420, yTop: 176, yBot: 240 },   // P4 → P5
  { x: 350, yTop: 112, yBot: 176 },   // P5 → Top (single)
];

export function getPlatformY(plat: typeof PLATFORMS[0], x: number): number {
  const slope = plat.slope || 0;
  return plat.y + (x - plat.x1) * slope;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Find which platform index an entity is on based on y position
export function findPlatformIndex(y: number, x: number): number {
  for (let i = 0; i < PLATFORMS.length; i++) {
    const plat = PLATFORMS[i];
    const platY = getPlatformY(plat, x);
    if (x >= plat.x1 && x <= plat.x2 && Math.abs(y - platY) < 16) {
      return i;
    }
  }
  return 0;
}

// Find the best ladder to use to get closer to a target
export function findBestLadder(entityX: number, entityPlatIdx: number, targetPlatIdx: number, goingDown: boolean, targetX?: number): number | null {
  let bestIdx: number | null = null;
  let bestDist = Infinity;

  for (let i = 0; i < LADDERS.length; i++) {
    const l = LADDERS[i];
    const topPlatIdx = PLATFORMS.findIndex(p => Math.abs(p.y - l.yTop) < 8);
    const botPlatIdx = PLATFORMS.findIndex(p => Math.abs(p.y - l.yBot) < 8);

    if (goingDown) {
      // Need ladder whose top is on our platform
      if (topPlatIdx === entityPlatIdx && botPlatIdx > entityPlatIdx) {
        // Score: distance from entity + distance from target on the next platform
        const distFromEntity = Math.abs(l.x - entityX);
        const distFromTarget = targetX !== undefined ? Math.abs(l.x - targetX) : 0;
        const score = distFromEntity + distFromTarget * 0.5;
        if (score < bestDist) { bestDist = score; bestIdx = i; }
      }
    } else {
      // Need ladder whose bottom is on our platform
      if (botPlatIdx === entityPlatIdx && topPlatIdx < entityPlatIdx) {
        const distFromEntity = Math.abs(l.x - entityX);
        const distFromTarget = targetX !== undefined ? Math.abs(l.x - targetX) : 0;
        const score = distFromEntity + distFromTarget * 0.5;
        if (score < bestDist) { bestDist = score; bestIdx = i; }
      }
    }
  }
  return bestIdx;
}
