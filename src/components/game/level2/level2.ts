// ============================================================
// Level 2 — module entry
// ------------------------------------------------------------
// Stage 2: real monkeys (1+ per platform), green jackets,
// volcano shape, and gravity-tracking fireballs.
// All level-2 mutable state lives inside `L2State`. Monkeys are
// pushed into the host's existing `g.robots` array so the host's
// L1 robot renderer/updater handles them; L2 only paints jacket
// overlays and fireball/volcano on top of the L1 scene.
// ============================================================

import {
  CANVAS_W, CANVAS_H, PLATFORMS, getPlatformY,
  ROBOT_SPEED, type Robot,
} from '../constants';
import { LEVEL2_PARAMS } from './params';
import { L2State, makeEmptyL2State } from './types';

export interface L2Sprites {
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

// Indices of platforms that should host monkeys (P2..P5).
const MONKEY_PLAT_INDICES = [1, 2, 3, 4];

/** Re-initialize for a new L2 round. */
export function initLevel2(s: L2State, round: number): void {
  const prev = s.round;
  Object.assign(s, makeEmptyL2State());
  s.round = round > 0 ? round : prev;
  s.initialized = true;
  s.fireballTimer = 60; // first fireball ~1s after start
}

/**
 * Spawn one robot per P2..P5 into the host's robots array (so the
 * existing L1 robot updater/renderer animates them). Records jacket
 * color in L2 state, indexed parallel to spawn order.
 *
 * Returns the spawned robots so the host can push them itself.
 */
export function spawnLevel2Robots(
  s: L2State,
  rng: () => number = Math.random,
): { robots: (Robot & { wanderTimer?: number; wanderDir?: number })[];
    jackets: ('green' | null)[] } {
  const robots: (Robot & { wanderTimer?: number; wanderDir?: number })[] = [];
  const jackets: ('green' | null)[] = [];

  // Decide how many green jackets (1 or 2)
  const greenCount = LEVEL2_PARAMS.GREEN_JACKET_BASE + (rng() < 0.5 ? 0 : 1);
  // Pick which monkey indices wear green
  const platCount = MONKEY_PLAT_INDICES.length;
  const greenSet = new Set<number>();
  while (greenSet.size < Math.min(greenCount, platCount)) {
    greenSet.add(Math.floor(rng() * platCount));
  }

  for (let i = 0; i < platCount; i++) {
    const pi = MONKEY_PLAT_INDICES[i];
    const plat = PLATFORMS[pi];
    const rx = plat.x1 + 30 + rng() * (plat.x2 - plat.x1 - 60);
    const ry = getPlatformY(plat, rx) - 16;
    const spd = ROBOT_SPEED * (0.5 + rng() * 0.4);
    robots.push({
      x: rx, y: ry, w: 14, h: 16, vx: 0, vy: 0,
      onGround: true, climbing: false, targetLadder: null,
      direction: rng() > 0.5 ? 1 : -1,
      frame: 0, frameTimer: 0, speed: spd,
    });
    jackets.push(greenSet.has(i) ? 'green' : null);
  }
  // Stash jackets on L2 state (parallel to robots[] of host)
  (s as any)._jackets = jackets;
  return { robots, jackets };
}

/** Read jacket color for a given robot index. */
export function getJacketAt(s: L2State, idx: number): 'green' | 'purple' | null {
  const arr: ('green' | 'purple' | null)[] = (s as any)._jackets || [];
  return arr[idx] ?? null;
}

/**
 * One frame of level-2 logic. `playerX/playerY` are the caveman's
 * canvas coords so the volcano can target him. Returns true when
 * the level has been completed (host plays outro). For now: false.
 */
export function updateLevel2(
  s: L2State,
  _frame: number,
  playerX: number = CANVAS_W / 2,
  playerY: number = CANVAS_H - 64,
): boolean {
  if (!s.initialized) return false;

  // ── Fireballs: cap at MAX_FIREBALLS in flight, otherwise tick timer
  const inFlight = s.fireballs.filter(f => !f.landed).length;
  if (inFlight < LEVEL2_PARAMS.MAX_FIREBALLS) {
    if (s.fireballTimer > 0) {
      s.fireballTimer--;
    } else {
      // launch a fireball aimed at the current player position
      const mouth = getVolcanoMouth();
      // Initial upward velocity (small "pop up"), then gravity pulls it down
      // toward the player. We use a simple physics integration in the
      // fireball itself rather than the parametric arc.
      const fb: any = {
        startX: mouth.x, startY: mouth.y,
        endX: playerX, endY: playerY,
        apexY: mouth.y - 50,
        t: 0,
        duration: Math.round(LEVEL2_PARAMS.FIREBALL_FLIGHT_SEC * 60),
        landed: false,
        x: mouth.x,
        y: mouth.y,
        radius: LEVEL2_PARAMS.FIREBALL_START_RADIUS,
        // physics state
        vx: 0,
        vy: -3.6, // pop up first
      };
      s.fireballs.push(fb);
      // Reset timer with ±50% jitter
      const base = LEVEL2_PARAMS.FIREBALL_INTERVAL_SEC * 60;
      s.fireballTimer = Math.round(base * (0.5 + Math.random()));
    }
  }

  // Update fireballs
  for (const fb of s.fireballs as any[]) {
    if (fb.landed) continue;
    // Horizontal pull toward player (very light, so the arc reads natural)
    const dx = playerX - fb.x;
    fb.vx += Math.sign(dx) * 0.06;
    // Cap horizontal speed
    if (fb.vx > 2.4) fb.vx = 2.4;
    if (fb.vx < -2.4) fb.vx = -2.4;
    // Gravity
    fb.vy += 0.18;
    fb.x += fb.vx;
    fb.y += fb.vy;
    // Grow radius as it falls
    const grow = Math.min(1, Math.max(0, (fb.y - fb.startY + 50) / 220));
    fb.radius =
      LEVEL2_PARAMS.FIREBALL_START_RADIUS +
      (LEVEL2_PARAMS.FIREBALL_END_RADIUS - LEVEL2_PARAMS.FIREBALL_START_RADIUS) * grow;
    // Land when off-screen bottom or below ground
    if (fb.y > CANVAS_H - 24) {
      fb.landed = true;
    }
  }
  // Drop landed fireballs after a short delay
  s.fireballs = s.fireballs.filter((f: any) => !f.landed);

  return false;
}

/** Render the Level-2-specific overlays (volcano + fireballs +
 *  jacket overlays). The host already drew L1 platforms, ladders,
 *  dragon, princess and robots underneath. */
export function renderLevel2(
  ctx: CanvasRenderingContext2D,
  s: L2State,
  _sprites: L2Sprites,
  hostRobots?: { x: number; y: number; w: number; h: number; direction: number }[],
): void {
  // ── Volcano on the top platform (right side, behind dragon area is
  //   to the LEFT, so place volcano on the FAR RIGHT of top platform).
  const topPlat = PLATFORMS[PLATFORMS.length - 1];
  const baseY = getPlatformY(topPlat, topPlat.x2 - 40);
  const baseCX = topPlat.x2 - 40;
  const baseW = 90;
  const volH = 56;

  // Cone body
  const leftX = baseCX - baseW / 2;
  const rightX = baseCX + baseW / 2;
  const peakLX = baseCX - 18;
  const peakRX = baseCX + 18;
  const peakY = baseY - volH;

  // Outer cone (dark rock)
  ctx.fillStyle = '#3a2418';
  ctx.beginPath();
  ctx.moveTo(leftX, baseY);
  ctx.lineTo(peakLX, peakY);
  ctx.lineTo(peakRX, peakY);
  ctx.lineTo(rightX, baseY);
  ctx.closePath();
  ctx.fill();

  // Lighter rock highlight on left flank
  ctx.fillStyle = '#5a3826';
  ctx.beginPath();
  ctx.moveTo(leftX + 4, baseY);
  ctx.lineTo(peakLX + 2, peakY + 2);
  ctx.lineTo(peakLX + 8, peakY + 2);
  ctx.lineTo(leftX + 22, baseY);
  ctx.closePath();
  ctx.fill();

  // Crater (dark ellipse on top)
  ctx.fillStyle = '#1a0a06';
  ctx.beginPath();
  ctx.ellipse(baseCX, peakY + 2, (peakRX - peakLX) / 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Lava glow inside crater
  ctx.fillStyle = '#ff6a1a';
  ctx.beginPath();
  ctx.ellipse(baseCX, peakY + 2, (peakRX - peakLX) / 2 - 3, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath();
  ctx.ellipse(baseCX, peakY + 2, (peakRX - peakLX) / 2 - 6, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Lava drip down right flank
  ctx.fillStyle = '#ff4a18';
  ctx.fillRect(baseCX + 6, peakY + 4, 3, 10);
  ctx.fillRect(baseCX + 8, peakY + 12, 2, 8);

  if (s.volcanoSealed) {
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.ellipse(baseCX, peakY, (peakRX - peakLX) / 2 + 2, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Jacket overlays on host robots (drawn as a small colored
  //   rectangle across the robot's torso so it reads as a jacket).
  if (hostRobots && hostRobots.length) {
    const jackets: ('green' | 'purple' | null)[] = (s as any)._jackets || [];
    for (let i = 0; i < hostRobots.length; i++) {
      const j = jackets[i];
      if (!j) continue;
      const r = hostRobots[i];
      // robot is drawn 33x33 anchored on its feet at (r.x..r.x+r.w, r.y+r.h)
      const drawW = 33;
      const drawH = 33;
      const dx = r.x + r.w / 2 - drawW / 2;
      const dy = r.y + r.h - drawH;
      ctx.fillStyle = j === 'green' ? '#2e9b3a' : '#7a2bd1';
      // torso band
      ctx.fillRect(dx + 9, dy + 14, 16, 8);
      // shoulders
      ctx.fillRect(dx + 7, dy + 14, 4, 5);
      ctx.fillRect(dx + 23, dy + 14, 4, 5);
      // collar highlight
      ctx.fillStyle = j === 'green' ? '#74e07f' : '#c79bff';
      ctx.fillRect(dx + 13, dy + 14, 8, 2);
    }
  }

  // ── Fireballs
  for (const fb of s.fireballs as any[]) {
    // outer glow
    ctx.fillStyle = 'rgba(255, 120, 30, 0.35)';
    ctx.beginPath();
    ctx.arc(fb.x, fb.y, fb.radius + 4, 0, Math.PI * 2);
    ctx.fill();
    // body
    ctx.fillStyle = '#ff6a1a';
    ctx.beginPath();
    ctx.arc(fb.x, fb.y, fb.radius, 0, Math.PI * 2);
    ctx.fill();
    // hot core
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.arc(fb.x - fb.radius * 0.2, fb.y - fb.radius * 0.2, Math.max(1, fb.radius * 0.55), 0, Math.PI * 2);
    ctx.fill();
    // little smoke trail
    ctx.fillStyle = 'rgba(80, 40, 20, 0.25)';
    ctx.beginPath();
    ctx.arc(fb.x - (fb.vx || 0) * 3, fb.y - (fb.vy || 0) * 1.5, fb.radius * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Holes in platforms (drawn as dark gaps)
  ctx.fillStyle = '#1a0a08';
  for (const h of s.holes) {
    const plat = PLATFORMS[h.platformIdx];
    const y = getPlatformY(plat, h.centerX);
    ctx.fillRect(h.centerX - h.width / 2, y - 1, h.width, 12);
  }
}

export function getVolcanoMouth(): { x: number; y: number } {
  const topPlat = PLATFORMS[PLATFORMS.length - 1];
  const baseY = getPlatformY(topPlat, topPlat.x2 - 40);
  const baseCX = topPlat.x2 - 40;
  const volH = 56;
  return { x: baseCX, y: baseY - volH + 2 };
}

export { LEVEL2_PARAMS };
