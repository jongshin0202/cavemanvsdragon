// ============================================================
// Level 2 — module entry
// ------------------------------------------------------------
// Stage 2: real monkeys, jackets, volcano, fireballs, holes,
// rock-sealing mechanic, two-color watering-can puzzle, and
// princess-rescue outro.
// ============================================================

import {
  CANVAS_W, CANVAS_H, PLATFORMS, getPlatformY,
  ROBOT_SPEED, type Robot, GRAVITY,
} from '../constants';
import { LEVEL2_PARAMS } from './params';
import { L2State, makeEmptyL2State, L2VolcanoRock } from './types';
import { TOP_GAP_X1, TOP_GAP_X2 } from './layout';

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

const MONKEY_PLAT_INDICES = [1, 2, 3, 4];

/** Re-initialize for a new L2 round. */
export function initLevel2(s: L2State, round: number): void {
  const prev = s.round;
  Object.assign(s, makeEmptyL2State());
  s.round = round > 0 ? round : prev;
  s.initialized = true;
  s.fireballTimer = 60;
  // Spawn the GREEN watering can at level start on a random platform.
  spawnGreenCan(s);
}

// ============================================================
// MONKEYS
// ============================================================

export function spawnLevel2Robots(
  s: L2State,
  rng: () => number = Math.random,
): { robots: (Robot & { wanderTimer?: number; wanderDir?: number })[];
    jackets: ('green' | 'purple' | null)[] } {
  const robots: (Robot & { wanderTimer?: number; wanderDir?: number })[] = [];
  const jackets: ('green' | 'purple' | null)[] = [];

  // Initial: only green jackets exist (purple appears after volcano sealed).
  const greenCount = LEVEL2_PARAMS.GREEN_JACKET_BASE;
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
  (s as any)._jackets = jackets;
  return { robots, jackets };
}

export function getJacketAt(s: L2State, idx: number): 'green' | 'purple' | null {
  const arr: ('green' | 'purple' | null)[] = (s as any)._jackets || [];
  return arr[idx] ?? null;
}

/** Called by host whenever a monkey is killed. Index = position in
 *  host's robots array BEFORE removal. */
export function onMonkeyKilled(s: L2State, idx: number): void {
  const arr: ('green' | 'purple' | null)[] = (s as any)._jackets || [];
  const jacket = arr[idx];
  if (jacket === 'green') s.greenJacketsKilled++;
  else if (jacket === 'purple') s.purpleJacketsKilled++;
  arr.splice(idx, 1);

  // After volcano sealed, every replacement spawn has a chance to be purple
  // up to the cap of PURPLE_JACKET_BASE alive at once.
  // (We don't auto-respawn here; the host's existing respawn logic doesn't
  // exist for L2 monkeys yet, so jackets are assigned at spawn time. The
  // newSpawnJacket() helper below is used by the host when adding a robot.)
}

/** Returns the jacket color a newly-spawned monkey should wear given
 *  current state. Honors caps for both green and purple. */
export function newSpawnJacket(s: L2State): 'green' | 'purple' | null {
  const arr: ('green' | 'purple' | null)[] = (s as any)._jackets || [];
  const greenAlive = arr.filter(j => j === 'green').length;
  const purpleAlive = arr.filter(j => j === 'purple').length;
  // Purple priority once unlocked
  if (s.purpleJacketPhase && purpleAlive < LEVEL2_PARAMS.PURPLE_JACKET_BASE) {
    if (Math.random() < 0.5) return 'purple';
  }
  if (greenAlive < LEVEL2_PARAMS.GREEN_JACKET_BASE) {
    if (Math.random() < 0.4) return 'green';
  }
  return null;
}

/** Push a jacket assignment for a newly-added monkey (called by host
 *  after pushing into robots[]). */
export function pushJacket(s: L2State, jacket: 'green' | 'purple' | null): void {
  const arr: ('green' | 'purple' | null)[] = (s as any)._jackets || [];
  arr.push(jacket);
  (s as any)._jackets = arr;
}

// ============================================================
// HOLES — punched into platforms by fireballs (or permanent for the
// top-platform split). Player falls through a hole if his feet are
// over its x-range on the matching platform.
// ============================================================

/** Returns true if the given x lies within ANY hole on platformIdx. */
export function isHoleAtPlatform(s: L2State, platformIdx: number, x: number): boolean {
  // Permanent top-platform split (acts like a permanent hole on PLATFORMS[5]).
  if (platformIdx === PLATFORMS.length - 1 && TOP_GAP_X2 > TOP_GAP_X1) {
    if (x >= TOP_GAP_X1 && x <= TOP_GAP_X2) return true;
  }
  for (const h of s.holes) {
    if (h.platformIdx !== platformIdx) continue;
    if (x >= h.centerX - h.width / 2 && x <= h.centerX + h.width / 2) return true;
  }
  return false;
}

function addHoleAt(s: L2State, x: number, y: number): void {
  // Find which platform this y is on (closest above-or-equal).
  let bestIdx = -1;
  let bestDy = Infinity;
  for (let i = 0; i < PLATFORMS.length; i++) {
    const platY = getPlatformY(PLATFORMS[i], x);
    const dy = Math.abs(platY - y);
    if (dy < 14 && dy < bestDy) { bestDy = dy; bestIdx = i; }
  }
  if (bestIdx < 0) return;
  // Don't punch holes in the top platform (it already has the permanent gap).
  if (bestIdx === PLATFORMS.length - 1) return;
  const plat = PLATFORMS[bestIdx];
  const w = LEVEL2_PARAMS.HOLE_WIDTH;
  const cx = Math.max(plat.x1 + w / 2 + 4, Math.min(plat.x2 - w / 2 - 4, x));
  const min = LEVEL2_PARAMS.HOLE_MIN_LIFETIME_SEC * 60;
  const max = LEVEL2_PARAMS.HOLE_MAX_LIFETIME_SEC * 60;
  const ttl = Math.round(min + Math.random() * (max - min));
  s.holes.push({ platformIdx: bestIdx, centerX: cx, width: w, ttl });
}

// ============================================================
// WATERING CANS
// ============================================================

function pickRandomPlatformPos(): { x: number; y: number; platIdx: number } {
  const idx = 1 + Math.floor(Math.random() * 4); // P2..P5
  const plat = PLATFORMS[idx];
  const margin = 24;
  const x = plat.x1 + margin + Math.random() * Math.max(1, plat.x2 - plat.x1 - margin * 2);
  const y = getPlatformY(plat, x) - 16;
  return { x, y, platIdx: idx };
}

function spawnGreenCan(s: L2State): void {
  if (s.greenCanSpawned) return;
  const p = pickRandomPlatformPos();
  s.greenCan = { x: p.x, y: p.y, w: 22, h: 18, color: 'green', collected: false };
  s.greenCanSpawned = true;
}

function spawnPurpleCan(s: L2State): void {
  if (s.purpleCanSpawned) return;
  const p = pickRandomPlatformPos();
  s.purpleCan = { x: p.x, y: p.y, w: 22, h: 18, color: 'purple', collected: false };
  s.purpleCanSpawned = true;
}

/** Player picks up a watering can if standing on it. Returns the color
 *  picked up, or null. */
export function tryPickupCan(s: L2State, p: { x: number; y: number; w: number; h: number }): 'green' | 'purple' | null {
  if (s.carryingCan) return null;
  const overlaps = (c: { x: number; y: number; w: number; h: number } | null) =>
    !!c && p.x < c.x + c.w && p.x + p.w > c.x && p.y < c.y + c.h && p.y + p.h > c.y;
  if (s.greenCan && !s.greenCan.collected && overlaps(s.greenCan)) {
    s.greenCan.collected = true;
    s.carryingCan = 'green';
    return 'green';
  }
  if (s.purpleCan && !s.purpleCan.collected && overlaps(s.purpleCan)) {
    s.purpleCan.collected = true;
    s.carryingCan = 'purple';
    return 'purple';
  }
  return null;
}

// ============================================================
// VOLCANO ROCK
// ============================================================

/** Called externally when the green sprout finishes growing. */
export function maybeSpawnVolcanoRock(s: L2State): void {
  if (s.rockSpawned || s.volcanoSealed) return;
  const mouth = getVolcanoMouth();
  const sz = LEVEL2_PARAMS.VOLCANO_ROCK_SIZE;
  // pop up with random horizontal velocity to land somewhere random
  const vx = (Math.random() - 0.5) * 4.5;
  s.volcanoRock = {
    x: mouth.x - sz / 2, y: mouth.y - sz, w: sz, h: sz,
    vx, vy: LEVEL2_PARAMS.VOLCANO_ROCK_VY, landed: false, collected: false,
  };
  s.rockSpawned = true;
}

function updateVolcanoRock(s: L2State): void {
  const r = s.volcanoRock;
  if (!r || r.collected) return;
  if (!r.landed) {
    r.vy += GRAVITY;
    r.x += r.vx; r.y += r.vy;
    // Land on first platform encountered when falling
    if (r.vy >= 0) {
      for (const plat of PLATFORMS) {
        if (r.x + r.w > plat.x1 && r.x < plat.x2) {
          const platY = getPlatformY(plat, r.x + r.w / 2);
          if (r.y + r.h >= platY && r.y + r.h <= platY + 14) {
            // Don't land in a hole or in the top-platform gap
            const cx = r.x + r.w / 2;
            const platIdx = PLATFORMS.indexOf(plat);
            if (isHoleAtPlatform(s, platIdx, cx)) continue;
            r.y = platY - r.h;
            r.vy = 0;
            r.vx = 0;
            r.landed = true;
            break;
          }
        }
      }
    }
    if (r.y > CANVAS_H + 40) {
      // Off screen — re-launch
      s.rockSpawned = false;
      s.volcanoRock = null;
    }
  }
}

/** Player picks up the rock if standing on it. */
export function tryPickupRock(s: L2State, p: { x: number; y: number; w: number; h: number }): boolean {
  const r = s.volcanoRock;
  if (!r || !r.landed || r.collected || s.carryingRock) return false;
  if (p.x < r.x + r.w && p.x + p.w > r.x && p.y < r.y + r.h && p.y + p.h > r.y) {
    r.collected = true;
    s.carryingRock = true;
    return true;
  }
  return false;
}

/** Called when player is at the volcano mouth carrying the rock. */
export function trySealVolcano(s: L2State, playerCX: number, playerFeetY: number): boolean {
  if (!s.carryingRock || s.volcanoSealed) return false;
  const mouth = getVolcanoMouth();
  // Top platform y-range and player must be near volcano horizontally
  const onTop = playerFeetY < 130 && playerFeetY > 100;
  const nearVolcano = Math.abs(playerCX - mouth.x) < 28;
  if (onTop && nearVolcano) {
    s.volcanoSealed = true;
    s.carryingRock = false;
    s.volcanoRock = null;
    s.purpleJacketPhase = true; // purple monkey phase begins
    return true;
  }
  return false;
}

// ============================================================
// PURPLE CAN GATE
// ============================================================

/** Call once per frame; if all purple-jacket monkeys have been killed
 *  AND volcano is sealed AND purple can hasn't spawned yet → spawn it. */
function maybeSpawnPurpleCan(s: L2State): void {
  if (!s.purpleJacketPhase || s.purpleCanSpawned) return;
  if (s.purpleJacketsKilled < LEVEL2_PARAMS.PURPLE_JACKET_BASE) return;
  spawnPurpleCan(s);
}

// ============================================================
// MAIN UPDATE
// ============================================================

export function updateLevel2(
  s: L2State,
  _frame: number,
  playerX: number = CANVAS_W / 2,
  playerY: number = CANVAS_H - 64,
): boolean {
  if (!s.initialized) return false;

  // ── Fireballs (only if NOT sealed) ──────────────────────
  if (!s.volcanoSealed) {
    const inFlight = s.fireballs.filter(f => !f.landed).length;
    if (inFlight < LEVEL2_PARAMS.MAX_FIREBALLS) {
      if (s.fireballTimer > 0) {
        s.fireballTimer--;
      } else {
        const mouth = getVolcanoMouth();
        const fb: any = {
          startX: mouth.x, startY: mouth.y,
          endX: playerX, endY: playerY,
          apexY: mouth.y - 50,
          t: 0,
          duration: Math.round(LEVEL2_PARAMS.FIREBALL_FLIGHT_SEC * 60),
          landed: false,
          x: mouth.x, y: mouth.y,
          radius: LEVEL2_PARAMS.FIREBALL_START_RADIUS,
          vx: 0, vy: -3.6,
        };
        s.fireballs.push(fb);
        const base = LEVEL2_PARAMS.FIREBALL_INTERVAL_SEC * 60;
        s.fireballTimer = Math.round(base * (0.5 + Math.random()));
      }
    }
  }

  // Update fireballs
  for (const fb of s.fireballs as any[]) {
    if (fb.landed) continue;
    const dx = playerX - fb.x;
    fb.vx += Math.sign(dx) * 0.06;
    if (fb.vx > 2.4) fb.vx = 2.4;
    if (fb.vx < -2.4) fb.vx = -2.4;
    fb.vy += 0.18;
    fb.x += fb.vx;
    fb.y += fb.vy;
    const grow = Math.min(1, Math.max(0, (fb.y - fb.startY + 50) / 220));
    fb.radius =
      LEVEL2_PARAMS.FIREBALL_START_RADIUS +
      (LEVEL2_PARAMS.FIREBALL_END_RADIUS - LEVEL2_PARAMS.FIREBALL_START_RADIUS) * grow;
    // Check landing on a platform — if so, punch a hole.
    let landedOnPlat = false;
    for (const plat of PLATFORMS) {
      if (fb.x > plat.x1 && fb.x < plat.x2) {
        const platY = getPlatformY(plat, fb.x);
        if (fb.y >= platY - 4 && fb.y <= platY + 12) {
          // Land!
          addHoleAt(s, fb.x, platY);
          fb.landed = true;
          landedOnPlat = true;
          break;
        }
      }
    }
    if (!landedOnPlat && fb.y > CANVAS_H - 24) {
      addHoleAt(s, fb.x, CANVAS_H - 48);
      fb.landed = true;
    }
  }
  s.fireballs = s.fireballs.filter((f: any) => !f.landed);

  // Tick hole TTLs
  for (let i = s.holes.length - 1; i >= 0; i--) {
    const h = s.holes[i];
    h.ttl--;
    if (h.ttl <= 0) s.holes.splice(i, 1);
  }

  // Volcano rock
  updateVolcanoRock(s);

  // Purple can spawn check
  maybeSpawnPurpleCan(s);

  return false;
}

/** Returns true if the player overlaps any active fireball — host uses
 *  this to apply a fatal hit. */
export function fireballHitsPlayer(
  s: L2State,
  p: { x: number; y: number; w: number; h: number },
): boolean {
  for (const fb of s.fireballs as any[]) {
    if (fb.landed) continue;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const dx = cx - fb.x;
    const dy = cy - fb.y;
    const r = fb.radius + 8;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

// ============================================================
// RENDER
// ============================================================

export function renderLevel2(
  ctx: CanvasRenderingContext2D,
  s: L2State,
  _sprites: L2Sprites,
  hostRobots?: { x: number; y: number; w: number; h: number; direction: number }[],
): void {
  // ── Volcano on the FAR RIGHT of the top platform (right of the gap)
  const topPlat = PLATFORMS[PLATFORMS.length - 1];
  const baseY = getPlatformY(topPlat, topPlat.x2 - 40);
  const baseCX = topPlat.x2 - 40;
  const baseW = 90;
  const volH = 56;

  const leftX = baseCX - baseW / 2;
  const rightX = baseCX + baseW / 2;
  const peakLX = baseCX - 18;
  const peakRX = baseCX + 18;
  const peakY = baseY - volH;

  ctx.fillStyle = '#3a2418';
  ctx.beginPath();
  ctx.moveTo(leftX, baseY); ctx.lineTo(peakLX, peakY);
  ctx.lineTo(peakRX, peakY); ctx.lineTo(rightX, baseY);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = '#5a3826';
  ctx.beginPath();
  ctx.moveTo(leftX + 4, baseY); ctx.lineTo(peakLX + 2, peakY + 2);
  ctx.lineTo(peakLX + 8, peakY + 2); ctx.lineTo(leftX + 22, baseY);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = '#1a0a06';
  ctx.beginPath();
  ctx.ellipse(baseCX, peakY + 2, (peakRX - peakLX) / 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (s.volcanoSealed) {
    // Big grey rock plug
    ctx.fillStyle = '#6e6e6e';
    ctx.beginPath();
    ctx.ellipse(baseCX, peakY + 1, (peakRX - peakLX) / 2 + 3, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.ellipse(baseCX - 3, peakY, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Lava
    ctx.fillStyle = '#ff6a1a';
    ctx.beginPath();
    ctx.ellipse(baseCX, peakY + 2, (peakRX - peakLX) / 2 - 3, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.ellipse(baseCX, peakY + 2, (peakRX - peakLX) / 2 - 6, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff4a18';
    ctx.fillRect(baseCX + 6, peakY + 4, 3, 10);
    ctx.fillRect(baseCX + 8, peakY + 12, 2, 8);
  }

  // ── Holes painted over platforms (dark gaps).
  ctx.fillStyle = '#000';
  for (const h of s.holes) {
    const plat = PLATFORMS[h.platformIdx];
    const y = getPlatformY(plat, h.centerX);
    ctx.fillRect(h.centerX - h.width / 2, y - 2, h.width, 14);
  }
  // Permanent top-platform gap
  if (TOP_GAP_X2 > TOP_GAP_X1) {
    const y = getPlatformY(topPlat, (TOP_GAP_X1 + TOP_GAP_X2) / 2);
    ctx.fillRect(TOP_GAP_X1, y - 2, TOP_GAP_X2 - TOP_GAP_X1, 14);
  }

  // ── Watering cans on ground
  const drawCan = (c: { x: number; y: number; w: number; h: number; color: 'green' | 'purple' } | null) => {
    if (!c) return;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    const fill = c.color === 'green' ? '#2e9b3a' : '#7a2bd1';
    const hi = c.color === 'green' ? '#74e07f' : '#c79bff';
    // glow
    ctx.fillStyle = c.color === 'green' ? 'rgba(116, 224, 127, 0.35)' : 'rgba(199, 155, 255, 0.35)';
    ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
    // body
    ctx.fillStyle = fill;
    ctx.fillRect(cx - 8, cy - 5, 14, 10);
    ctx.fillRect(cx + 5, cy - 2, 4, 4);
    ctx.fillStyle = hi;
    ctx.fillRect(cx - 7, cy - 4, 4, 2);
    // spout
    ctx.fillStyle = fill;
    ctx.fillRect(cx - 12, cy - 3, 4, 3);
  };
  if (s.greenCan && !s.greenCan.collected) drawCan(s.greenCan);
  if (s.purpleCan && !s.purpleCan.collected) drawCan(s.purpleCan);

  // ── Volcano rock (in-flight or landed)
  if (s.volcanoRock && !s.volcanoRock.collected) {
    const r = s.volcanoRock;
    ctx.fillStyle = '#777';
    ctx.beginPath();
    ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#999';
    ctx.beginPath();
    ctx.arc(r.x + r.w / 2 - 2, r.y + r.h / 2 - 2, r.w / 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Jacket overlays
  if (hostRobots && hostRobots.length) {
    const jackets: ('green' | 'purple' | null)[] = (s as any)._jackets || [];
    for (let i = 0; i < hostRobots.length; i++) {
      const j = jackets[i];
      if (!j) continue;
      const r = hostRobots[i];
      const drawW = 33;
      const drawH = 33;
      const dx = r.x + r.w / 2 - drawW / 2;
      const dy = r.y + r.h - drawH;
      ctx.fillStyle = j === 'green' ? '#2e9b3a' : '#7a2bd1';
      ctx.fillRect(dx + 9, dy + 14, 16, 8);
      ctx.fillRect(dx + 7, dy + 14, 4, 5);
      ctx.fillRect(dx + 23, dy + 14, 4, 5);
      ctx.fillStyle = j === 'green' ? '#74e07f' : '#c79bff';
      ctx.fillRect(dx + 13, dy + 14, 8, 2);
    }
  }

  // ── Fireballs
  for (const fb of s.fireballs as any[]) {
    ctx.fillStyle = 'rgba(255, 120, 30, 0.35)';
    ctx.beginPath();
    ctx.arc(fb.x, fb.y, fb.radius + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff6a1a';
    ctx.beginPath();
    ctx.arc(fb.x, fb.y, fb.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.arc(fb.x - fb.radius * 0.2, fb.y - fb.radius * 0.2, Math.max(1, fb.radius * 0.55), 0, Math.PI * 2);
    ctx.fill();
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
