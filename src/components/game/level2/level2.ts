// ============================================================
// Level 2 — module entry
// ------------------------------------------------------------
// Stage 2: real monkeys, jackets, volcano, fireballs, holes,
// rock-sealing mechanic, two-color watering-can puzzle, and
// princess-rescue outro.
// ============================================================

import {
  CANVAS_W, CANVAS_H, PLATFORMS, getPlatformY,
  ROBOT_SPEED, type Robot, GRAVITY, isLevel3Round, getLevelIteration,
} from '../constants';
import { LEVEL2_PARAMS, getLevel2Difficulty, setCurrentLevel2Iteration } from './params';
import { L2State, makeEmptyL2State, L2VolcanoRock } from './types';
import { TOP_GAP_X1, TOP_GAP_X2, getSprouts } from './layout';
import { LADDERS } from '../constants';
import { getMovingPlatforms } from '../level3/movingPlatforms';
import { getL3MpsMonkeyCounts } from '../level3/params';

/** Returns true if punching a hole of width HOLE_W centered at `x` on
 *  platform `platIdx` would overlap any sprout location — either the
 *  sprout's BASE (lower platform) or its TOP (upper platform where the
 *  vine emerges). Fire rocks must never land on top of a sprout. */
function isHoleOverlappingSprout(platIdx: number, x: number): boolean {
  const HOLE_W = LEVEL2_PARAMS.HOLE_WIDTH;
  const SPROUT_HALF = 10; // vine half-width
  const minDist = HOLE_W / 2 + SPROUT_HALF + 2;
  const platY = PLATFORMS[platIdx].y;
  for (let i = 0; i < LADDERS.length; i++) {
    const l = LADDERS[i];
    const onBase = Math.abs(l.yBot - platY) <= 2;
    const onTop = Math.abs(l.yTop - platY) <= 2;
    if (!onBase && !onTop) continue;
    if (Math.abs(x - l.x) < minDist) return true;
  }
  return false;
}

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

/** Re-initialize for a new L2 round. `round` here is the L2 ITERATION number
 *  (1, 2, 3, …) — host computes via getLevelIteration() before calling. */
export function initLevel2(s: L2State, round: number): void {
  const prev = s.round;
  Object.assign(s, makeEmptyL2State());
  s.round = round > 0 ? round : prev;
  s.initialized = true;
  // Publish the iteration so layout / sprout-runtime can read difficulty too.
  setCurrentLevel2Iteration(s.round);
  const diff = getLevel2Difficulty(s.round);
  s.fireballTimer = 60;
  // Per-iteration purple target = full purple count for this iteration.
  s.purpleTarget = Math.max(1, diff.purpleJacketCount);
  // Green watering can does NOT spawn at level start. It spawns only after
  // the player kills the required number of green-jacketed monkeys.
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
  const diff = getLevel2Difficulty(s.round);
  // L3 override: keep monkeys on the ceiling sprout platform only. The old
  // split/floor platform was removed, so spawning there made monkeys fall
  // and collect on the left middle side.
  const isL3 = !!(s as any)._isL3;

  // ── L3: per-iteration distribution across MPLs (rows 0..3).
  //   Iter 1: [0,1,0,1] (one monkey on MPL 2 and one on MPL 4).
  //   +1 monkey per iteration, filling lowest-count MPL first, max 3/MPL.
  //   The MP the main character starts on is excluded from spawn pool.
  if (isL3) {
    const mps = getMovingPlatforms();
    const MC_X = 80, MC_W = 16;
    const isMcMp = (mp: typeof mps[number]) =>
      mp.row === 0 && MC_X + MC_W > mp.x && MC_X < mp.x + mp.w;
    const iter = Math.max(1, s.round | 0);
    const counts = getL3MpsMonkeyCounts(iter);
    let mpsCount = 0;
    for (let row = 0; row < 4; row++) {
      const want = counts[row] || 0;
      if (want <= 0) continue;
      // Eligible MPs in this row (exclude MC's starting MP).
      const eligible = mps.filter(mp => mp.row === row && !isMcMp(mp));
      if (eligible.length === 0) continue;
      // Shuffle + take `want` (clamped).
      for (let i = eligible.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
      }
      const pick = eligible.slice(0, Math.min(want, eligible.length));
      for (const mp of pick) {
        const rx = mp.x + (mp.w - 14) / 2;
        const ry = mp.y - 16;
        const spd = ROBOT_SPEED * (diff.monkeySpeedMul + rng() * diff.monkeySpeedJitter);
        const r: Robot & { wanderTimer?: number; wanderDir?: number } = {
          x: rx, y: ry, w: 14, h: 16, vx: 0, vy: 0,
          onGround: true, climbing: false, targetLadder: null,
          direction: rng() > 0.5 ? 1 : -1,
          frame: 0, frameTimer: 0, speed: spd,
        };
        (r as any)._mpsL3 = true;
        (r as any)._rideMp = mp;
        (r as any)._lastMpX = mp.x;
        (r as any).wanderDir = r.direction;
        robots.push(r);
        // From iter 3, MPS monkeys throw apples (green jacket).
        jackets.push(iter >= 3 ? 'green' : null);
        mpsCount++;
      }
    }
    // SS monkeys on PLATFORMS[4] (top sprout platform). Count = iter (cap 2).
    const tsp = PLATFORMS[4];
    const ssCount = Math.max(1, Math.min(2, iter));
    if (tsp.x2 - tsp.x1 > 0) {
      for (let k = 0; k < ssCount; k++) {
        const frac = ssCount === 1 ? 0.5 : (k === 0 ? 0.25 : 0.75);
        const rx = tsp.x1 + (tsp.x2 - tsp.x1) * frac - 7;
        const ry = tsp.y - 16;
        const spd = ROBOT_SPEED * (diff.monkeySpeedMul + rng() * diff.monkeySpeedJitter);
        const r: Robot & { wanderTimer?: number; wanderDir?: number } = {
          x: rx, y: ry, w: 14, h: 16, vx: 0, vy: 0,
          onGround: true, climbing: false, targetLadder: null,
          direction: k === 0 ? 1 : -1,
          frame: 0, frameTimer: 0, speed: spd,
        };
        (r as any)._ssL3 = true;
        robots.push(r);
        jackets.push('green');
      }
    }
    (s as any)._jackets = jackets;
    (s as any)._appleCooldowns = jackets.map(() => randomCooldownFrames());
    (s as any)._hasAppleAlive = jackets.map(() => false);
    (s as any)._l3MpsCount = mpsCount;
    return { robots, jackets };
  }

  const platSlots: number[] = MONKEY_PLAT_INDICES.slice();
  const platCount = platSlots.length;
  const initialCount = Math.max(1, Math.min(diff.maxMonkeys, platCount));
  // Pick which slots get a monkey (random, no duplicates by index position).
  const platOrder = [...Array(platCount).keys()];
  for (let i = platOrder.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [platOrder[i], platOrder[j]] = [platOrder[j], platOrder[i]];
  }
  const chosenSlots = platOrder.slice(0, initialCount);
  // Of the chosen monkeys, mark up to greenJacketCount as green.
  const greenCount = Math.min(diff.greenJacketCount, initialCount);
  const greenSet = new Set<number>(); // indices into chosenSlots
  while (greenSet.size < greenCount) {
    greenSet.add(Math.floor(rng() * chosenSlots.length));
  }

  for (let i = 0; i < chosenSlots.length; i++) {
    const pi = platSlots[chosenSlots[i]];
    const plat = PLATFORMS[pi];
    const rx = plat.x1 + 30 + rng() * (plat.x2 - plat.x1 - 60);
    const ry = getPlatformY(plat, rx) - 16;
    const spd = ROBOT_SPEED * (diff.monkeySpeedMul + rng() * diff.monkeySpeedJitter);
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
  const diff = getLevel2Difficulty(s.round);
  const greensAlive = arr.filter(j => j === 'green').length;
  if (!s.greenCanSpawned &&
      s.greenJacketsKilled >= diff.greenJacketCount &&
      greensAlive === 0) {
    spawnGreenCan(s);
  }
}

/** Returns the jacket color a newly-spawned monkey should wear given
 *  current state. Honors caps for both green and purple. */
export function newSpawnJacket(s: L2State): 'green' | 'purple' | null {
  // L3 post-seal: pop from a fixed shuffled queue of (iter green + iter purple).
  const q: ('green' | 'purple')[] | undefined = (s as any)._l3RespawnJackets;
  if (q && q.length > 0) return q.shift()!;

  const arr: ('green' | 'purple' | null)[] = (s as any)._jackets || [];
  const greenAlive = arr.filter(j => j === 'green').length;
  const purpleAlive = arr.filter(j => j === 'purple').length;
  const diff = getLevel2Difficulty(s.round);
  if (s.purpleJacketPhase) {
    const purplesRemaining = Math.max(0, s.purpleTarget - s.purpleJacketsKilled - purpleAlive);
    if (purplesRemaining > 0 && purpleAlive < s.purpleTarget) {
      if (Math.random() < 0.85) return 'purple';
    }
  }
  // Only spawn green-jacket monkeys until the round's green-kill quota is hit.
  const greensNeeded = Math.max(0, diff.greenJacketCount - s.greenJacketsKilled - greenAlive);
  if (greensNeeded > 0 && greenAlive < diff.greenJacketCount) {
    if (Math.random() < 0.4) return 'green';
  }
  return null;
}

/** Called when the player seals the volcano in L3. Builds a shuffled queue
 *  of (iter green + iter purple) jackets to assign to upcoming respawns,
 *  and returns the total count for the host to push respawn delays. */
export function notifyVolcanoSealedL3(s: L2State): number {
  const iter = Math.max(1, getLevelIteration(s.round));
  const q: ('green' | 'purple')[] = [];
  for (let i = 0; i < iter; i++) q.push('green');
  for (let i = 0; i < iter; i++) q.push('purple');
  // Fisher-Yates shuffle
  for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [q[i], q[j]] = [q[j], q[i]];
  }
  (s as any)._l3RespawnJackets = q;
  // Bump targets so newSpawnJacket / kill counts gate correctly.
  s.purpleTarget = iter;
  return q.length;
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
  const diff = getLevel2Difficulty(s.round);
  // L3: jacketed sprout-section monkeys throw apples from iter 1.
  const applesEnabled = diff.applesEnabled || isLevel3Round(s.round);

  // Iteration 1 (L2 only): apples are completely disabled.
  if (!applesEnabled) {
    // Drain any in-flight apples (shouldn't exist, but be safe).
    s.apples.length = 0;
  } else {
  // Throw new apples
  for (let i = 0; i < hostRobots.length; i++) {
    if (!jackets[i]) continue;        // only colored monkeys throw
    if (alive[i]) continue;            // one apple at a time per monkey
    if (cd[i] > 0) { cd[i]--; continue; }
    const r = hostRobots[i];
    const dir = r.direction >= 0 ? 1 : -1;
    const ax = r.x + r.w / 2 + dir * 8;
    // Three throw heights, randomly chosen:
    //   LOW    — apple at the player's feet. Jumpable.
    //   MIDDLE — apple at chest height. Jumpable (slightly higher arc).
    //   HIGH   — a tall vertical fire-streak that reaches above the
    //            player's foot at jump apex (apex feet ≈ platY - 33),
    //            so jumping CANNOT clear it. Standing is also hit
    //            (streak reaches down to head height). Only DUCKING
    //            clears it (streak stops above the ducked hitbox).
    //
    // Vertical spacing for the visible apple TOP follows the user's
    // rule: distance from LOW to MIDDLE is the same as MIDDLE to HIGH.
    //   LOW    apple top = platY - 7
    //   MIDDLE apple top = platY - 19
    //   HIGH   apple top = platY - 31  (same +12 step)
    // Balance jumping vs ducking opportunities: HIGH (duck) ≈ 50%,
    // LOW + MIDDLE (jump) ≈ 50% combined (25% each).
    const roll = Math.random();
    const heightTier: 'low' | 'middle' | 'high' =
      roll < 0.25 ? 'low' : roll < 0.5 ? 'middle' : 'high';

    const aw = 7;
    let ah = 7;
    let ay: number;
    if (heightTier === 'low') {
      ay = (r.y + r.h) - ah - 1; // bottom on the platform
    } else if (heightTier === 'middle') {
      ay = (r.y + r.h) - 19; // bottom = platY - 12 (clears duck, jumpable)
    } else {
      // HIGH — small standard apple at the standing player's HEAD height.
      // Standing head ≈ platY - 24. Apple sits at that level so a standing
      // player is hit; ducking (hitbox top ≈ platY - 11) clears it.
      ah = 7;
      ay = (r.y + r.h) - 31; // top = platY - 31, bottom = platY - 24
    }
    const isSs = !!(hostRobots[i] as any)._ssL3;
    s.apples.push({
      x: ax, y: ay, w: aw, h: ah,
      vx: dir * diff.appleSpeed,
      ownerId: i,
      ...(heightTier === 'high' ? { _high: true } : {}),
      ...(heightTier === 'middle' ? { _mid: true } : {}),
      ...(isSs ? { _drop: true, vy: -1.2 } : {}),
    } as any);

    alive[i] = true;
  }

  // Update apples: travel horizontally; remove when off-screen; refresh cooldown.
  for (let i = s.apples.length - 1; i >= 0; i--) {
    const a = s.apples[i] as any;
    a.x += a.vx;
    if (a._drop) {
      a.vy = (a.vy ?? 0) + 0.18;
      a.y += a.vy;
    }
    if (a.x + a.w < -8 || a.x > CANVAS_W + 8 || a.y > CANVAS_H + 8) {
      // Apple safely passed — release thrower's cooldown.
      if (a.ownerId >= 0 && a.ownerId < alive.length) {
        alive[a.ownerId] = false;
        cd[a.ownerId] = randomCooldownFrames();
      }
      s.apples.splice(i, 1);
    }
  }
  } // end else (apples enabled)
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
  const diff = getLevel2Difficulty(s.round);
  const min = diff.holeLifeMinSec * 60;
  const max = diff.holeLifeMaxSec * 60;
  // Base lifetime + an extra random buffer (also iter-scaled).
  const baseTtl = Math.round(min + Math.random() * (max - min));
  const exMin = diff.holeExtraMinSec * 60;
  const exMax = diff.holeExtraMaxSec * 60;
  const extra = Math.round(exMin + Math.random() * (exMax - exMin));
  s.holes.push({ platformIdx: bestIdx, centerX: cx, width: w, ttl: baseTtl + extra });
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

  // Pick a random target platform from P1..P4 (indices 0..3) — exclude
  // the top platform (where the volcano sits) AND P5 (index 4, directly
  // below the volcano), so the rock visibly arcs DOWN like a fireball
  // instead of plopping right next to the mouth.
  const candidates = [0, 1, 2, 3];
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
  // Grey volcano-seal rock keeps its ORIGINAL flight speed (1.6s) at every
  // iteration — only fire rocks scale with difficulty.
  (rock as any)._duration = Math.round(1.6 * 60);
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
  const diffFB = getLevel2Difficulty(s.round);
  if (!s.volcanoSealed) {
    const inFlight = s.fireballs.filter(f => !f.landed).length;
    if (inFlight < diffFB.maxFireballs) {
      if (s.fireballTimer > 0) {
        s.fireballTimer--;
      } else {
        const mouth = getVolcanoMouth();
        // Target the player's current platform whenever possible. The rock
        // always aims toward the player's current x, with only a small random
        // angle variation so a standing player is not attacked by the exact
        // same line over and over.
        const TOP_IDX = PLATFORMS.length - 1;

        // Identify the player's platform (P0..P4 only).
        let playerPi = -1;
        for (let pi = 0; pi < TOP_IDX; pi++) {
          const plat = PLATFORMS[pi];
          const py = getPlatformY(plat, playerX);
          if (
            playerX >= plat.x1 && playerX <= plat.x2 &&
            Math.abs((playerY) - py) < 32
          ) { playerPi = pi; break; }
        }

        let pickPi: number;
        if (playerPi >= 0) {
          pickPi = playerPi;
        } else {
          // Airborne / between platforms: aim at the platform nearest the
          // player, not at a random safe platform elsewhere.
          const candidates = [0, 1, 2, 3, 4];
          candidates.sort((a, b) => {
            const ay = getPlatformY(PLATFORMS[a], playerX);
            const by = getPlatformY(PLATFORMS[b], playerX);
            return Math.abs(ay - playerY) - Math.abs(by - playerY);
          });
          pickPi = candidates[0];
        }

        const targetPlat = PLATFORMS[pickPi];
        const margin = 24;
        const HOLE_W = LEVEL2_PARAMS.HOLE_WIDTH;
        // Require at least one full hole-width of SOLID platform between any
        // two holes — otherwise they merge into an unjumpable double-gap.
        // Center-to-center distance must be ≥ HOLE_W + HOLE_W = 2 * HOLE_W.
        const MIN_CENTER_DIST = HOLE_W * 2;
        const minX = targetPlat.x1 + margin;
        const maxX = targetPlat.x2 - margin;
        const clampX = (v: number) => Math.max(minX, Math.min(maxX, v));

        // A candidate X is "clear" if it's at least MIN_CENTER_DIST from
        // every existing hole on this platform → guarantees ≥1 hole-width
        // of solid ground between holes (jumpable).
        const xIsClearOfHoles = (x: number): boolean =>
          !s.holes.some(h =>
            h.platformIdx === pickPi &&
            Math.abs(x - h.centerX) < MIN_CENTER_DIST,
          );
        const xIsClear = (x: number): boolean =>
          xIsClearOfHoles(x) && !isHoleOverlappingSprout(pickPi, x);

        const shuffledOffsets = [0, -0.45, 0.45, -0.85, 0.85, -1.2, 1.2]
          .map(mult => ({ mult, sort: Math.random() }))
          .sort((a, b) => a.sort - b.sort)
          .map(v => v.mult * HOLE_W);
        const lastTargetX: number | null = (s as any)._lastFireballTargetX ?? null;
        let targetX: number | null = null;
        for (const offset of shuffledOffsets) {
          const candidateX = clampX(playerX + offset);
          if (!xIsClear(candidateX)) continue;
          if (lastTargetX != null && Math.abs(candidateX - lastTargetX) < HOLE_W * 0.5) continue;
          targetX = candidateX;
          break;
        }
        if (targetX == null) {
          for (const offset of shuffledOffsets) {
            const candidateX = clampX(playerX + offset);
            if (xIsClear(candidateX)) { targetX = candidateX; break; }
          }
        }
        if (targetX == null) {
          // Sweep the platform for the closest spot that respects both the
          // non-adjacent-hole rule AND the don't-destroy-sprout-base rule.
          const step = 6;
          let bestX: number | null = null;
          let bestDist = Infinity;
          for (let x = minX; x <= maxX; x += step) {
            if (!xIsClear(x)) continue;
            const d = Math.abs(x - playerX);
            if (d < bestDist) { bestDist = d; bestX = x; }
          }
          targetX = bestX;
        }
        if (targetX == null) {
          // Very crowded: still aim at the character, but the landing code
          // will refuse to punch a hole if it would be adjacent to another.
          targetX = clampX(playerX);
        }
        (s as any)._lastFireballTargetX = targetX;
        const aimedX = targetX;
        const endY = getPlatformY(targetPlat, targetX);
        const travelX = aimedX - mouth.x;
        const apexX = mouth.x + travelX * (0.48 + Math.random() * 0.16) + (Math.random() - 0.5) * HOLE_W;
        const apexY = Math.min(mouth.y, endY) - (48 + Math.random() * 30);



        // Per-rock random flight time within iteration's [min, max] —
        // when multiple rocks coexist, each rock has its own speed up to
        // the iteration's max (shorter flight = faster rock).
        const flightSec = diffFB.fireballFlightMinSec +
          Math.random() * (diffFB.fireballFlightMaxSec - diffFB.fireballFlightMinSec);
        const fb: any = {
          startX: mouth.x, startY: mouth.y,
          endX: aimedX, endY,
          targetPlatIdx: pickPi,
          targetX,
          apexX,
          apexY,
          t: 0,
          duration: Math.round(flightSec * 60),
          landed: false,
          x: mouth.x, y: mouth.y,
          radius: LEVEL2_PARAMS.FIREBALL_START_RADIUS,
          vx: 0, vy: -3.6,
        };
        s.fireballs.push(fb);
        const base = diffFB.fireballIntervalSec * 60;
        s.fireballTimer = Math.round(base * (0.5 + Math.random()));
      }
    }
  }

  // Update fireballs
  for (const fb of s.fireballs as any[]) {
    if (fb.landed) continue;
    // Follow the selected randomized arc exactly so the rock visibly travels
    // toward the character instead of repeating one fixed physics trajectory.
    fb.t = Math.min(1, fb.t + 1 / Math.max(1, fb.duration));
    const t = fb.t;
    const omt = 1 - t;
    const sx = fb.startX;
    const sy = fb.startY;
    const ex = fb.endX;
    const ey = fb.endY;
    const ax = fb.apexX ?? (sx + ex) / 2;
    const ay = fb.apexY;
    fb.x = omt * omt * sx + 2 * omt * t * ax + t * t * ex;
    fb.y = omt * omt * sy + 2 * omt * t * ay + t * t * ey;
    const grow = t;
    fb.radius =
      LEVEL2_PARAMS.FIREBALL_START_RADIUS +
      (LEVEL2_PARAMS.FIREBALL_END_RADIUS - LEVEL2_PARAMS.FIREBALL_START_RADIUS) * grow;
    // Check landing — always on the pre-chosen target platform. The fireball
    // is force-landed at its targetX once its y reaches that platform's surface,
    // regardless of horizontal drift. Guarantees every fireball makes a hole.
    const TOP_IDX = PLATFORMS.length - 1;
    const targetPi: number = fb.targetPlatIdx ?? -1;
    if (targetPi >= 0 && targetPi !== TOP_IDX) {
      const plat = PLATFORMS[targetPi];
      const innerMargin = LEVEL2_PARAMS.HOLE_WIDTH / 2 + 4;
      const clampPlat = (v: number) =>
        Math.max(plat.x1 + innerMargin, Math.min(plat.x2 - innerMargin, v));
      let landX = clampPlat(fb.targetX ?? fb.endX ?? fb.x);
      const platY = getPlatformY(plat, landX);
      if (fb.t >= 1 || fb.y >= platY - 4) {
        // Hard rule: holes must never touch — keep ≥1 hole-width of solid
        // platform between any two hole centers (center distance ≥ 2*HOLE_W).
        const HOLE_W = LEVEL2_PARAMS.HOLE_WIDTH;
        const MIN_DIST = HOLE_W * 2;
        const tooCloseToHole = (x: number) =>
          s.holes.some(h =>
            h.platformIdx === targetPi &&
            Math.abs(x - h.centerX) < MIN_DIST,
          );
        const isBadSpot = (x: number) =>
          tooCloseToHole(x) || isHoleOverlappingSprout(targetPi, x);
        if (isBadSpot(landX)) {
          // Try the pre-validated targetX first.
          const pre = fb.targetX != null ? clampPlat(fb.targetX) : landX;
          if (!isBadSpot(pre)) {
            landX = pre;
          } else {
            // Sweep platform for the closest spot that respects the rule.
            const step = 6;
            let bestX: number | null = null;
            let bestDist = Infinity;
            for (let x = plat.x1 + innerMargin; x <= plat.x2 - innerMargin; x += step) {
              if (isBadSpot(x)) continue;
              const d = Math.abs(x - landX);
              if (d < bestDist) { bestDist = d; bestX = x; }
            }
            if (bestX != null) landX = bestX;
            else { fb.landed = true; continue; } // no safe spot — skip the hole
          }
        }
        addHoleAt(s, landX, platY);
        (s as any)._lastFireballPlat = targetPi;
        fb.x = landX;
        fb.y = platY;
        fb.landed = true;
      }
    } else if (fb.y > CANVAS_H - 24) {
      fb.landed = true;
    }
  }
  s.fireballs = s.fireballs.filter((f: any) => !f.landed);

  // Tick hole TTLs (skip permanent holes with ttl < 0)
  for (let i = s.holes.length - 1; i >= 0; i--) {
    const h = s.holes[i];
    if (h.ttl < 0) continue;
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
    if (dx * dx + dy * dy <= r * r) {
      // The rock is consumed by the hit — mark landed so it never punches
      // a hole in the platform below.
      fb.landed = true;
      return true;
    }
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
  const baseCX = topPlat.x2 - 95;
  const baseY = getPlatformY(topPlat, baseCX);
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
  for (const a of s.apples as any[]) {
    const cx = a.x + a.w / 2;
    // For HIGH throws the hitbox is a tall streak (so jumping can't clear
    // it), but the player should still SEE a normal apple — drawn at the
    // TOP of the streak so it visually reads as "above jump height".
    // For low/middle, the apple is drawn at the centre of its small hitbox.
    const drawW = 7;
    const drawH = 7;
    const cy = a._high ? a.y + drawH / 2 : a.y + a.h / 2;
    // body
    ctx.fillStyle = '#d6201f';
    ctx.beginPath();
    ctx.arc(cx, cy, drawW / 2 + 1, 0, Math.PI * 2);
    ctx.fill();
    // shine
    ctx.fillStyle = '#ff8a87';
    ctx.fillRect(cx - 2, cy - 3, 2, 2);
    // stem
    ctx.fillStyle = '#5a2a08';
    ctx.fillRect(cx, cy - drawH / 2 - 2, 1, 2);
    // leaf
    ctx.fillStyle = '#2e8b33';
    ctx.fillRect(cx + 1, cy - drawH / 2 - 1, 2, 1);
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
  // Volcano sits with ~80px of empty platform to its right so the green
  // sprout's climb path lands beside it (not under it).
  const baseCX = topPlat.x2 - 95;
  const baseY = getPlatformY(topPlat, baseCX);
  const volH = 56;
  return { x: baseCX, y: baseY - volH + 2 };
}

export { LEVEL2_PARAMS };
