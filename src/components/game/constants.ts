export const CANVAS_W = 512;
export const CANVAS_H = 768;
export const TILE = 16;
export const GRAVITY = 0.5;
export const JUMP_FORCE = -8;
export const MOVE_SPEED = 2.5;
export const BARREL_SPEED = 1.2;
export const CLIMB_SPEED = 2;
export const ROBOT_SPEED = 0.7;

export interface Rect { x: number; y: number; w: number; h: number }
export interface Barrel extends Rect { vx: number; vy: number; onLadder: boolean; falling: boolean; targetLadder: number | null; speed: number; rollPhase?: number }
export interface Robot extends Rect { vx: number; vy: number; onGround: boolean; climbing: boolean; targetLadder: number | null; direction: number; frame: number; frameTimer: number; speed: number }

// Platform definitions (y, xStart, xEnd)
// P1=ground, P2, P3, P4, P5, Top
// "tilting up L→R" = right side higher = slope < 0 (y decreases going right)
// Platforms stretched vertically for portrait mobile aspect (gap ~104 instead of 64)
export const PLATFORMS: { y: number; x1: number; x2: number; slope?: number }[] = [
  { y: 700, x1: 0, x2: 512, slope: -0.02 },            // P1: full width (ground)
  { y: 596, x1: 0, x2: 464, slope: 0.02 },              // P2
  { y: 492, x1: 48, x2: 512, slope: -0.02 },            // P3
  { y: 388, x1: 0, x2: 464, slope: 0.02 },              // P4
  { y: 284, x1: 48, x2: 512, slope: -0.02 },            // P5
  { y: 180, x1: 80, x2: 432, slope: 0.02 },             // Top
];

// Ladders extended to span the larger gaps
export const LADDERS: { x: number; yTop: number; yBot: number }[] = [
  { x: 120, yTop: 596, yBot: 700 },   // P1 → P2
  { x: 360, yTop: 596, yBot: 700 },   // P1 → P2
  { x: 240, yTop: 492, yBot: 596 },   // P2 → P3
  { x: 440, yTop: 492, yBot: 596 },   // P2 → P3
  { x: 100, yTop: 388, yBot: 492 },   // P3 → P4
  { x: 340, yTop: 388, yBot: 492 },   // P3 → P4
  { x: 220, yTop: 284, yBot: 388 },   // P4 → P5
  { x: 420, yTop: 284, yBot: 388 },   // P4 → P5
  { x: 350, yTop: 180, yBot: 284 },   // P5 → Top
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
