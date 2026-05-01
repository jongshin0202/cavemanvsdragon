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
  // Random per-round purple target: between 1 and PURPLE_JACKET_BASE (cap 2).
  const cap = Math.max(1, LEVEL2_PARAMS.PURPLE_JACKET_BASE);
  s.purpleTarget = 1 + Math.floor(Math.random() * cap); // 1..cap
  if (s.purpleTarget > cap) s.purpleTarget = cap;
  // Green watering can does NOT spawn at level start. It spawns only after
  // the player kills the required number of green-jacketed monkeys
  // (see onMonkeyKilled → spawnGreenCan gate).
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
  (s as any)._appleCooldowns = jackets.map(() => randomCooldownFrames());
  (s as any)._hasAppleAlive = jackets.map(() => false);
  return { robots, jackets };
}

function randomCooldownFrames(): number {
  const min = LEVEL2_PARAMS.APPLE_COOLDOWN_MIN_SEC * 60;
  const max = LEVEL2_PARAMS.APPLE_COOLDOWN_MAX_SEC * 60;
  return Math.round(min + Math.random() * (max - min));
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
  const cd: number[] = (s as any)._appleCooldowns || [];
  const al: boolean[] = (s as any)._hasAppleAlive || [];
  cd.splice(idx, 1);
  al.splice(idx, 1);
  // Re-key in-flight apples whose owner index shifted, or orphan them.
  for (const a of s.apples) {
    if (a.ownerId === idx) a.ownerId = -1;
    else if (a.ownerId > idx) a.ownerId--;
  }
  // Once the green-kill target is met AND no green-jacket monkeys remain
  // alive, spawn the green watering can on a random platform.
  const greensAlive = arr.filter(j => j === 'green').length;
  if (!s.greenCanSpawned &&
      s.greenJacketsKilled >= LEVEL2_PARAMS.GREEN_JACKET_BASE &&
      greensAlive === 0) {
    spawnGreenCan(s);
  }
}

/** Returns the jacket color a newly-spawned monkey should wear given
 *  current state. Honors caps for both green and purple. */
export function newSpawnJacket(s: L2State): 'green' | 'purple' | null {
  const arr: ('green' | 'purple' | null)[] = (s as any)._jackets || [];
  const greenAlive = arr.filter(j => j === 'green').length;
  const purpleAlive = arr.filter(j => j === 'purple').length;
  if (s.purpleJacketPhase) {
    // How many more purples still need to be created this round?
    const purplesRemaining = Math.max(0, s.purpleTarget - s.purpleJacketsKilled - purpleAlive);
    if (purplesRemaining > 0 && purpleAlive < s.purpleTarget) {
      // Strongly prefer purple until quota fills, so the player can complete the round.
      if (Math.random() < 0.85) return 'purple';
    }
  }
  // Only spawn green-jacket monkeys until the round's green-kill quota is hit.
  // Once met, the green watering can has spawned and no more greens should appear.
  const greensNeeded = Math.max(0, LEVEL2_PARAMS.GREEN_JACKET_BASE - s.greenJacketsKilled - greenAlive);
  if (greensNeeded > 0 && greenAlive < LEVEL2_PARAMS.GREEN_JACKET_BASE) {
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
  const cd: number[] = (s as any)._appleCooldowns || [];
  const al: boolean[] = (s as any)._hasAppleAlive || [];
  cd.push(randomCooldownFrames());
  al.push(false);
  (s as any)._appleCooldowns = cd;
  (s as any)._hasAppleAlive = al;
}

// ============================================================
// APPLES — thrown by colored (jacketed) monkeys; player ducks under them.
// ============================================================

/** Called every frame by host with current host robots[] (parallel to _jackets).
 *  Spawns apples for jacketed monkeys whose cooldown elapsed; updates
 *  in-flight apples; removes off-screen apples and refreshes cooldowns. */
export function tickApples(
  s: L2State,
  hostRobots: { x: number; y: number; w: number; h: number; direction: number }[],
): void {
  const jackets: ('green' | 'purple' | null)[] = (s as any)._jackets || [];
  const cd: number[] = (s as any)._appleCooldowns || [];
  const alive: boolean[] = (s as any)._hasAppleAlive || [];

  // Throw new apples
  for (let i = 0; i < hostRobots.length; i++) {
    if (!jackets[i]) continue;        // only colored monkeys throw
    if (alive[i]) continue;            // one apple at a time per monkey
    if (cd[i] > 0) { cd[i]--; continue; }
    const r = hostRobots[i];
    const dir = r.direction >= 0 ? 1 : -1;
    const ax = r.x + r.w / 2 + dir * 8;
    // 50/50: throw LOW (must be jumped over) or HIGH (must be ducked under).
    // Low = near monkey's feet so a standing player would be hit unless jumping.
    // High = near monkey's head so a standing player would be hit unless ducking.
    const throwHigh = Math.random() < 0.5;
    const ay = throwHigh ? r.y - 4 : r.y + r.h - 9;
    s.apples.push({
      x: ax, y: ay, w: 7, h: 7,
      vx: dir * LEVEL2_PARAMS.APPLE_SPEED,
      ownerId: i,
    });
    alive[i] = true;
  }

  // Update apples: travel horizontally; remove when off-screen; refresh cooldown.
  for (let i = s.apples.length - 1; i >= 0; i--) {
    const a = s.apples[i];
    a.x += a.vx;
    if (a.x + a.w < -8 || a.x > CANVAS_W + 8) {
      // Apple safely passed — release thrower's cooldown.
      if (a.ownerId >= 0 && a.ownerId < alive.length) {
        alive[a.ownerId] = false;
        cd[a.ownerId] = randomCooldownFrames();
      }
      s.apples.splice(i, 1);
    }
  }
}

/** Returns true if any active apple overlaps the (possibly-ducked) player.
 *  When the player is ducked, the host should pass a shrunken hitbox. */
export function appleHitsPlayer(
  s: L2State,
  p: { x: number; y: number; w: number; h: number },
): number {
  for (let i = 0; i < s.apples.length; i++) {
    const a = s.apples[i];
    if (p.x < a.x + a.w && p.x + p.w > a.x &&
        p.y < a.y + a.h && p.y + p.h > a.y) {
      return i;
    }
  }
  return -1;
}

/** Award 100 points for each apple that just passed the player (jumped/ducked over).
 *  Called by host once per apple the first time the player avoids it. */
export function markAppleDodged(s: L2State, idx: number): void {
  const a = s.apples[idx] as any;
  if (a) a._dodged = true;
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

/** Called externally when the green sprout finishes growing.
 *  Launches a grey rock from the volcano on a parabolic arc toward a
 *  random target platform (like a fireball). It "lands" when the arc
 *  completes, then sits on that platform for the player to grab. */
export function maybeSpawnVolcanoRock(s: L2State): void {
  if (s.rockSpawned || s.volcanoSealed) return;
  const mouth = getVolcanoMouth();
  const sz = LEVEL2_PARAMS.VOLCANO_ROCK_SIZE;

  // Pick a random target platform from P1..P5 (indices 0..4) — explicitly
  // EXCLUDE the top platform (index PLATFORMS.length - 1 = 5) since the
  // volcano sits on it and rocks should land below for the player to grab.
  const TOP_IDX = PLATFORMS.length - 1;
  const candidates = [0, 1, 2, 3, 4].filter(i => i !== TOP_IDX);
  let targetX = mouth.x;
  let targetY = mouth.y + 100;
  for (let attempt = 0; attempt < 8; attempt++) {
    const pi = candidates[Math.floor(Math.random() * candidates.length)];
    const plat = PLATFORMS[pi];
    const margin = 20;
    const tx = plat.x1 + margin + Math.random() * Math.max(1, plat.x2 - plat.x1 - margin * 2);
    if (isHoleAtPlatform(s, pi, tx)) continue;
    targetX = tx;
    targetY = getPlatformY(plat, tx) - sz;
    break;
  }

  const rock: L2VolcanoRock = {
    x: mouth.x - sz / 2, y: mouth.y - sz, w: sz, h: sz,
    vx: 0, vy: 0, landed: false, collected: false,
  };
  // Stash arc parameters on the rock for updateVolcanoRock.
  (rock as any)._startX = mouth.x;
  (rock as any)._startY = mouth.y;
  (rock as any)._endX = targetX;
  (rock as any)._endY = targetY;
  (rock as any)._apexY = Math.min(mouth.y, targetY) - 60;
  (rock as any)._t = 0;
  (rock as any)._duration = Math.round(LEVEL2_PARAMS.FIREBALL_FLIGHT_SEC * 60);
  s.volcanoRock = rock;
  s.rockSpawned = true;
}

function updateVolcanoRock(s: L2State): void {
  const r = s.volcanoRock as any;
  if (!r || r.collected) return;
  if (!r.landed) {
    r._t = Math.min(1, r._t + 1 / r._duration);
    const t = r._t;
    // Quadratic Bezier through (start, apex, end) for an arc.
    const sx = r._startX, sy = r._startY;
    const ex = r._endX, ey = r._endY;
    const apexX = (sx + ex) / 2;
    const apexY = r._apexY;
    const omt = 1 - t;
    const cx = omt * omt * sx + 2 * omt * t * apexX + t * t * ex;
    const cy = omt * omt * sy + 2 * omt * t * apexY + t * t * ey;
    r.x = cx - r.w / 2;
    r.y = cy - r.h / 2;
    if (t >= 1) {
      r.x = ex - r.w / 2;
      r.y = ey;
      r.landed = true;
      r.vx = 0;
      r.vy = 0;
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
  if (s.purpleJacketsKilled < s.purpleTarget) return;
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

  // ── Full-body color tint on jacketed monkeys (was an overlay band before).
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
      const fill = j === 'green' ? 'rgba(46, 155, 58, 0.6)' : 'rgba(122, 43, 209, 0.6)';
      const outline = j === 'green' ? '#155a1c' : '#3a0e6a';
      // Body silhouette block over the monkey sprite
      ctx.fillStyle = fill;
      ctx.fillRect(dx + 6, dy + 8, 21, 22);
      // Head
      ctx.beginPath();
      ctx.arc(dx + drawW / 2, dy + 9, 8, 0, Math.PI * 2);
      ctx.fill();
      // Outline accent
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1;
      ctx.strokeRect(dx + 6, dy + 8, 21, 22);
    }
  }

  // ── Apples thrown by colored monkeys
  for (const a of s.apples) {
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    // body
    ctx.fillStyle = '#d6201f';
    ctx.beginPath();
    ctx.arc(cx, cy, a.w / 2 + 1, 0, Math.PI * 2);
    ctx.fill();
    // shine
    ctx.fillStyle = '#ff8a87';
    ctx.fillRect(cx - 2, cy - 3, 2, 2);
    // stem
    ctx.fillStyle = '#5a2a08';
    ctx.fillRect(cx, cy - a.h / 2 - 2, 1, 2);
    // leaf
    ctx.fillStyle = '#2e8b33';
    ctx.fillRect(cx + 1, cy - a.h / 2 - 1, 2, 1);
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
