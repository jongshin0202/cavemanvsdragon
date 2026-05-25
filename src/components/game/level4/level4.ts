// ============================================================
// Level 4 — Caveman vs Dragon (REDESIGNED)
// ------------------------------------------------------------
// Self-contained. No L1/L2/L3 imports beyond canvas size.
// Mechanic: volcano launches grey rocks → roll along top platform →
// at point C decide: if A (kick ledge slot) empty, rock drops to A
// and rests; else rolls off and zig-zags down as a hazard.
// Caveman climbs green sprout D → reaches A → kicks rock down → rock
// hits dragon. Each hit downs dragon 5s and spawns a purple can.
// Purple can waters purple sprout E (+1/iter each), and re-seeds D.
// X hits = dragon dies + E fully grown → climb E → princess.
// ============================================================

import { CANVAS_W, CANVAS_H } from '../constants';
import { LEVEL4_PARAMS, getLevel4Difficulty, type Level4Difficulty } from './params';

const GRAVITY = 0.38;
const MOVE_SPEED = 1.9;
const JUMP_FORCE = -5.2;
const CLIMB_SPEED = 1.5;

// ── Layout ───────────────────────────────────────────────────
// All platforms are simple axis-aligned rectangles. Index reused for
// dragon/monkey "platIdx".
export interface L4Platform { y: number; x1: number; x2: number; moving?: { axis: 'x' | 'y'; min: number; max: number; speed: number; phase: number } }
export const L4_PLATFORMS: L4Platform[] = [
  { y: 448, x1: 0,   x2: 512 },                 // 0 ground
  { y: 392, x1: 16,  x2: 168 },                 // 1 caveman spawn (left)
  { y: 392, x1: 200, x2: 312 },                 // 2 lower mid (monkey, moving)
  { y: 392, x1: 344, x2: 496 },                 // 3 lower right
  { y: 320, x1: 0,   x2: 120 },                 // 4 mid-left static
  { y: 320, x1: 152, x2: 360 },                 // 5 mid center (D sprout base)
  { y: 320, x1: 392, x2: 512 },                 // 6 mid-right static
  { y: 256, x1: 32,  x2: 170 },                 // 7 dragon-band left
  { y: 256, x1: 342, x2: 480 },                 // 8 dragon-band right
  { y: 192, x1: 170, x2: 342 },                 // 9 KICK LEDGE  (E at left, A at right)
  { y: 96,  x1: 80,  x2: 432 },                 // 10 princess top (volcano on right)
];

// Add horizontal moving platforms (visual flavour; not strictly required).
L4_PLATFORMS[2].moving = { axis: 'x', min: 184, max: 248, speed: 0.5, phase: 0 };
L4_PLATFORMS[6].moving = { axis: 'x', min: 376, max: 432, speed: 0.5, phase: 1 };

// Named anchors
const A_X = 308;                                // rock rest slot on kick ledge
const E_X = 192;                                // purple sprout base x
const D_X = 240;                                // green sprout x
const C_X = A_X;                                // drop point above A on princess platform
const VOLCANO_X = 400;
const PRINCESS_X = 110;
const PRINCESS_Y = L4_PLATFORMS[10].y - 48;
const KICK_LEDGE_IDX = 9;
const PRINCESS_PLAT_IDX = 10;
const D_BASE_PLAT_IDX = 5;
const D_TOP_PLAT_IDX = KICK_LEDGE_IDX;
const E_BASE_PLAT_IDX = KICK_LEDGE_IDX;
const E_TOP_PLAT_IDX = PRINCESS_PLAT_IDX;

const PRINCESS_W = 40, PRINCESS_H = 48;
const PLAYER_DRAW_W = 42, PLAYER_DRAW_H = 48;
const MONKEY_DRAW_W = 33, MONKEY_DRAW_H = 33;
const DRAGON_W = 64, DRAGON_H = 64;
const DRAGON_FRAMES = 5;
const ROBOT_FRAMES = 5;

// ── Types ────────────────────────────────────────────────────
type SproutPhase = 'seed' | 'growing' | 'alive' | 'withering';
interface Sprout {
  x: number;
  yTop: number;          // platform y the sprout reaches up to
  yBot: number;          // platform y it grows out of
  isPurple: boolean;
  phase: SproutPhase;
  growProgress: number;  // 0..1 visible length
  // for D (green) only — alive→withering cycle (L2-style)
  aliveTimer: number;
  regrowTimer: number;
  inUse?: boolean;
}

interface Player {
  x: number; y: number; w: number; h: number;
  vx: number; vy: number;
  onGround: boolean;
  groundPlatIdx: number;
  jumpStartPlatIdx: number;
  climbing: boolean;
  facing: number;
  jumping: boolean;
  walkFrame: number; walkTimer: number;
  jumpFrame: number; jumpTimer: number;
  climbFrame: number; climbTimer: number;
  kickTimer: number;      // >0 = currently in kick animation
}

type RockState = 'flying' | 'rollingTop' | 'restingAtA' | 'falling' | 'rollingDown' | 'dead';
interface Rock {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  state: RockState;
  platIdx: number;        // current platform (for rolling)
  age: number;
  /** When falling from A: tracks whether this rock has already counted as a hit. */
  hitConsumed?: boolean;
}

interface Fireball {
  x: number; y: number;
  sx: number; sy: number;        // start position
  tx: number; ty: number;        // target landing position
  age: number;                   // frames since launch
  flight: number;                // total frames until landing
  radius: number;                // current visible radius
  landed: boolean;
}

type DragonState = 'roam' | 'downed' | 'dying' | 'dead';
interface Dragon {
  x: number; y: number;
  vx: number; vy: number;
  airborne: boolean;
  platIdx: number;
  targetPlatIdx: number;
  facing: number;
  jumpCooldown: number;
  state: DragonState;
  downedTimer: number;
  dyingTimer: number;
  hits: number;
  frame: number; frameTimer: number;
}

interface Monkey {
  alive: boolean;
  x: number; y: number;
  platIdx: number;
  vx: number;
  facing: number;
  walkFrame: number; walkTimer: number;
}

interface Can { x: number; y: number; color: 'green' | 'purple'; picked: boolean }

interface Ending { active: boolean; phase: 'hug' | 'pause' | 'kidnap' | 'follow' | 'done'; timer: number; newDragonX: number }

export interface L4State {
  iter: number;
  diff: Level4Difficulty;
  tick: number;
  player: Player;
  dragon: Dragon;
  monkeys: Monkey[];
  rocks: Rock[];
  spawnRockTimer: number;
  sproutD: Sprout;
  sproutE: Sprout;
  greenCan: Can | null;
  purpleCan: Can | null;
  carrying: null | 'green' | 'purple';
  /** Per-iter partial-grow chunk for E. */
  eGrowChunk: number;
  /** Set true once green can has spawned this monkey wave. */
  greenCanSpawned: boolean;
  /** Rock currently parked at A (if any). */
  rockAtAIdx: number;
  fireballs: Fireball[];
  fireballTimer: number;
  fireballMax: number;
  fireballFlightFrames: number;
  ending: Ending;
  won: boolean;
  died: boolean;
  dying: boolean;
  deathTimer: number;
  deathReported: boolean;
  invuln: number;
  princessX: number;
  princessY: number;
}

export interface L4Sprites {
  cavemanWalk: HTMLImageElement;
  cavemanJump: HTMLImageElement;
  cavemanClimb: HTMLImageElement;
  cavemanWin: HTMLImageElement;
  dragonFire: HTMLImageElement;
  dragonAngry: HTMLImageElement;
  princess: HTMLImageElement;
  heart: HTMLImageElement;
  wateringCan: HTMLImageElement;
  robotWalk: HTMLImageElement;
  rockWheel: HTMLImageElement;
}
export interface L4Input { left: boolean; right: boolean; up: boolean; down: boolean; jump: boolean }

// ── Init ─────────────────────────────────────────────────────
export function initLevel4(iter: number): L4State {
  const diff = getLevel4Difficulty(iter);

  const player: Player = {
    x: 60, y: L4_PLATFORMS[1].y - 24, w: 16, h: 24,
    vx: 0, vy: 0, onGround: true, groundPlatIdx: 1, jumpStartPlatIdx: 1,
    climbing: false, facing: 1, jumping: false,
    walkFrame: 0, walkTimer: 0, jumpFrame: 0, jumpTimer: 0,
    climbFrame: 0, climbTimer: 0, kickTimer: 0,
  };

  const dragon: Dragon = {
    x: 250, y: L4_PLATFORMS[7].y - DRAGON_H,
    vx: 0, vy: 0, airborne: false,
    platIdx: 7, targetPlatIdx: 7,
    facing: -1, jumpCooldown: 60,
    state: 'roam', downedTimer: 0, dyingTimer: 0, hits: 0,
    frame: 0, frameTimer: 0,
  };

  // Monkeys distributed across the lower/mid platforms.
  const monkeyPlats = [2, 3, 4, 5, 6, 7, 8];
  const monkeys: Monkey[] = [];
  for (let i = 0; i < diff.monkeyCount; i++) {
    const pi = monkeyPlats[i % monkeyPlats.length];
    monkeys.push(makeMonkey(pi));
  }

  const sproutD: Sprout = {
    x: D_X, yTop: L4_PLATFORMS[D_TOP_PLAT_IDX].y, yBot: L4_PLATFORMS[D_BASE_PLAT_IDX].y,
    isPurple: false, phase: 'seed', growProgress: 0,
    aliveTimer: 0, regrowTimer: 0,
  };
  const sproutE: Sprout = {
    x: E_X, yTop: L4_PLATFORMS[E_TOP_PLAT_IDX].y, yBot: L4_PLATFORMS[E_BASE_PLAT_IDX].y,
    isPurple: true, phase: 'seed', growProgress: 0,
    aliveTimer: 0, regrowTimer: 0,
  };

  return {
    iter,
    diff,
    tick: 0,
    player,
    dragon,
    monkeys,
    rocks: [],
    spawnRockTimer: 90,
    sproutD,
    sproutE,
    greenCan: null,
    purpleCan: null,
    carrying: null,
    eGrowChunk: 1 / Math.max(1, diff.hitsToKill),
    greenCanSpawned: false,
    rockAtAIdx: -1,
    fireballs: [],
    fireballTimer: 90,
    fireballMax: 1 + Math.floor((iter - 1) / 3),
    fireballFlightFrames: Math.max(180, Math.round(LEVEL4_PARAMS.FIREBALL_FLIGHT_SEC * 60 * Math.pow(0.9, iter - 1))),
    ending: { active: false, phase: 'hug', timer: 0, newDragonX: -DRAGON_W },
    won: false,
    died: false,
    dying: false,
    deathTimer: 0,
    deathReported: false,
    invuln: 60,
    princessX: PRINCESS_X,
    princessY: PRINCESS_Y,
  };
}

function makeMonkey(platIdx: number): Monkey {
  const plat = L4_PLATFORMS[platIdx];
  const w = plat.x2 - plat.x1;
  return {
    alive: true,
    x: plat.x1 + 16 + Math.random() * Math.max(8, w - 40),
    y: plat.y - 16,
    platIdx,
    vx: (Math.random() < 0.5 ? -1 : 1) * 0.55,
    facing: 1,
    walkFrame: 0, walkTimer: 0,
  };
}

// ── Update ───────────────────────────────────────────────────
export function updateLevel4(s: L4State, input: L4Input): { died: boolean; won: boolean } {
  s.tick++;
  if (s.ending.active) {
    tickEnding(s);
    return { died: false, won: s.won };
  }
  if (s.dying) {
    s.deathTimer++;
    let reportDied = false;
    if (!s.deathReported) { s.deathReported = true; reportDied = true; }
    if (s.deathTimer >= 108) {
      respawnPlayer(s);
      s.dying = false;
      s.deathTimer = 0;
      s.invuln = 120;
    }
    return { died: reportDied, won: false };
  }
  if (s.invuln > 0) s.invuln--;

  tickMovingPlatforms(s);
  tickRocks(s);
  tickFireballs(s);
  tickSprouts(s);
  tickMonkeys(s);
  tickDragon(s);
  tickPlayer(s, input);
  tickCans(s);
  tickCollisions(s);

  return { died: false, won: s.won };
}

function respawnPlayer(s: L4State) {
  const p = s.player;
  p.x = 60; p.y = L4_PLATFORMS[1].y - 24;
  p.vx = 0; p.vy = 0;
  p.onGround = true; p.climbing = false; p.jumping = false;
  p.groundPlatIdx = 1; p.jumpStartPlatIdx = 1;
  p.facing = 1; p.kickTimer = 0;
  // Drop any can carried? Keep carrying — quality-of-life.
}

// ── Moving platforms ────────────────────────────────────────
function tickMovingPlatforms(s: L4State) {
  for (const plat of L4_PLATFORMS) {
    if (!plat.moving) continue;
    plat.moving.phase += 0.02;
    const t = (Math.sin(plat.moving.phase) + 1) / 2;
    const span = plat.moving.max - plat.moving.min;
    const x = plat.moving.min + span * t;
    const w = plat.x2 - plat.x1;
    plat.x1 = x;
    plat.x2 = x + w;
  }
}

// ── Rocks ───────────────────────────────────────────────────
function tickRocks(s: L4State) {
  s.spawnRockTimer--;
  if (s.spawnRockTimer <= 0) {
    s.spawnRockTimer = Math.round(LEVEL4_PARAMS.FIREBALL_INTERVAL_SEC * 60);
    // Spawn rock from volcano arc onto princess platform near volcano.
    s.rocks.push({
      x: VOLCANO_X, y: L4_PLATFORMS[10].y - 36,
      vx: -2.2, vy: -3.4, r: 8,
      state: 'flying', platIdx: -1, age: 0,
    });
  }

  for (let i = 0; i < s.rocks.length; i++) {
    const r = s.rocks[i];
    r.age++;
    switch (r.state) {
      case 'flying': {
        r.vy += 0.18;
        r.x += r.vx;
        r.y += r.vy;
        // Land on princess platform
        const top = L4_PLATFORMS[10];
        if (r.vy > 0 && r.y + r.r >= top.y && r.x >= top.x1 && r.x <= top.x2) {
          r.y = top.y - r.r;
          r.vy = 0;
          r.vx = -1.4; // start rolling left
          r.state = 'rollingTop';
          r.platIdx = 10;
        } else if (r.y > CANVAS_H + 30 || r.x < -30 || r.x > CANVAS_W + 30) {
          r.state = 'dead';
        }
        break;
      }
      case 'rollingTop': {
        r.x += r.vx;
        const top = L4_PLATFORMS[10];
        // At point C: if A is empty AND we're at C, drop straight down.
        const aOccupied = s.rockAtAIdx >= 0 && s.rockAtAIdx !== i;
        if (!aOccupied && Math.abs(r.x - C_X) < 2) {
          r.state = 'falling';
          r.vy = 0; r.vx = 0;
          break;
        }
        // Fall off left edge → continue down as hazard
        if (r.x < top.x1 - 2) {
          r.state = 'rollingDown';
          r.vx = -1.0; r.vy = 0;
          r.platIdx = -1;
          break;
        }
        // Reached right edge somehow (shouldn't because vx < 0) → kill
        if (r.x > top.x2 + 2) { r.state = 'dead'; }
        break;
      }
      case 'falling': {
        r.vy += GRAVITY;
        r.y += r.vy;
        const kp = L4_PLATFORMS[KICK_LEDGE_IDX];
        // Land on kick ledge
        if (r.x >= kp.x1 && r.x <= kp.x2 && r.y + r.r >= kp.y) {
          r.y = kp.y - r.r;
          r.vy = 0;
          // If close to A and slot empty → rest at A; else roll left and fall off
          if (s.rockAtAIdx < 0) {
            r.x = A_X;
            r.state = 'restingAtA';
            r.platIdx = KICK_LEDGE_IDX;
            s.rockAtAIdx = i;
          } else {
            r.state = 'rollingDown';
            r.vx = -1.2;
          }
          break;
        }
        // Below kick ledge? Dragon hit check happens in collisions.
        // Off bottom → dead
        if (r.y > CANVAS_H + 20) r.state = 'dead';
        break;
      }
      case 'restingAtA':
        // Sit still until kicked.
        break;
      case 'rollingDown': {
        r.vy += GRAVITY * 0.5;
        r.x += r.vx;
        r.y += r.vy;
        // Try landing on any platform we cross
        for (let pi = 0; pi < L4_PLATFORMS.length; pi++) {
          const pl = L4_PLATFORMS[pi];
          if (r.x < pl.x1 || r.x > pl.x2) continue;
          if (r.vy > 0 && r.y + r.r >= pl.y && r.y + r.r <= pl.y + 10) {
            r.y = pl.y - r.r;
            r.vy = 0;
            r.platIdx = pi;
            // bias direction toward nearest edge for variety
            if (r.vx === 0) r.vx = Math.random() < 0.5 ? -1 : 1;
            break;
          }
        }
        if (r.y > CANVAS_H + 30 || r.x < -30 || r.x > CANVAS_W + 30) r.state = 'dead';
        break;
      }
      case 'dead':
        break;
    }
  }
  // Compact
  if (s.rocks.some(r => r.state === 'dead')) {
    const oldAtA = s.rockAtAIdx;
    const survivors: Rock[] = [];
    let newAtA = -1;
    for (let i = 0; i < s.rocks.length; i++) {
      if (s.rocks[i].state === 'dead') continue;
      if (i === oldAtA) newAtA = survivors.length;
      survivors.push(s.rocks[i]);
    }
    s.rocks = survivors;
    s.rockAtAIdx = newAtA;
  }
}

// ── Sprouts ─────────────────────────────────────────────────
function rollAliveFrames(): number {
  const sec = LEVEL4_PARAMS.SPROUT_ALIVE_MIN_SEC + Math.random() * (LEVEL4_PARAMS.SPROUT_ALIVE_MAX_SEC - LEVEL4_PARAMS.SPROUT_ALIVE_MIN_SEC);
  return Math.round(sec * 60);
}
function rollRegrowFrames(): number {
  const sec = LEVEL4_PARAMS.SPROUT_REGROW_MIN_SEC + Math.random() * (LEVEL4_PARAMS.SPROUT_REGROW_MAX_SEC - LEVEL4_PARAMS.SPROUT_REGROW_MIN_SEC);
  return Math.round(sec * 60);
}

function tickSprouts(s: L4State) {
  // D (green): full L2-style cycle once watered
  const d = s.sproutD;
  switch (d.phase) {
    case 'seed': break;
    case 'growing':
      d.growProgress = Math.min(1, d.growProgress + 1 / LEVEL4_PARAMS.SPROUT_GROW_FRAMES);
      if (d.growProgress >= 1) { d.phase = 'alive'; d.aliveTimer = rollAliveFrames(); }
      break;
    case 'alive':
      if (!d.inUse) {
        d.aliveTimer--;
        if (d.aliveTimer <= 0) d.phase = 'withering';
      }
      break;
    case 'withering':
      d.growProgress = Math.max(0, d.growProgress - 1 / LEVEL4_PARAMS.SPROUT_GROW_FRAMES);
      if (d.growProgress <= 0) { d.phase = 'seed'; d.growProgress = 0; }
      break;
  }
  d.inUse = false;

  // E (purple): only grows when watered; stays at whatever growProgress reached
  const e = s.sproutE;
  // E has no auto-wither; it persists and is used to climb at the end.
  e.inUse = false;
}

// ── Monkeys ─────────────────────────────────────────────────
function tickMonkeys(s: L4State) {
  for (const m of s.monkeys) {
    if (!m.alive) continue;
    const plat = L4_PLATFORMS[m.platIdx];
    m.x += m.vx;
    if (m.x < plat.x1 + 4) { m.x = plat.x1 + 4; m.vx = Math.abs(m.vx); }
    if (m.x > plat.x2 - 18) { m.x = plat.x2 - 18; m.vx = -Math.abs(m.vx); }
    m.facing = m.vx >= 0 ? 1 : -1;
    m.y = plat.y - 16;
    m.walkTimer++;
    if (m.walkTimer >= 6) { m.walkTimer = 0; m.walkFrame = (m.walkFrame + 1) % ROBOT_FRAMES; }
  }
  // Green can spawn: all monkeys dead AND not yet spawned this wave AND no green can present
  if (!s.greenCanSpawned && !s.greenCan && s.dragon.state !== 'dead' && s.monkeys.every(m => !m.alive)) {
    spawnCan(s, 'green');
    s.greenCanSpawned = true;
  }
}

function spawnCan(s: L4State, color: 'green' | 'purple') {
  // Random ground-level platform 1..8 (avoid top platforms 9,10).
  const candidates = [1, 2, 3, 4, 5, 6, 7, 8];
  const pi = candidates[Math.floor(Math.random() * candidates.length)];
  const pl = L4_PLATFORMS[pi];
  const x = pl.x1 + 14 + Math.random() * Math.max(8, pl.x2 - pl.x1 - 32);
  const can: Can = { x, y: pl.y - 14, color, picked: false };
  if (color === 'green') s.greenCan = can; else s.purpleCan = can;
}

function respawnMonkeyWave(s: L4State) {
  const monkeyPlats = [2, 3, 4, 5, 6, 7, 8];
  s.monkeys = [];
  for (let i = 0; i < s.diff.monkeyCount; i++) {
    s.monkeys.push(makeMonkey(monkeyPlats[i % monkeyPlats.length]));
  }
  s.greenCanSpawned = false;
}

// ── Dragon ──────────────────────────────────────────────────
function tickDragon(s: L4State) {
  const d = s.dragon;
  d.frameTimer++;
  if (d.frameTimer >= 8) { d.frameTimer = 0; d.frame = (d.frame + 1) % DRAGON_FRAMES; }

  if (d.state === 'dead') return;
  if (d.state === 'dying') {
    d.dyingTimer--;
    d.y += 1.4;
    if (d.dyingTimer <= 0) d.state = 'dead';
    return;
  }
  if (d.state === 'downed') {
    d.downedTimer--;
    d.y += 0.2;  // settle on floor
    if (d.downedTimer <= 0) {
      if (d.hits >= s.diff.hitsToKill) {
        d.state = 'dying';
        d.dyingTimer = 90;
      } else {
        d.state = 'roam';
      }
    }
    return;
  }

  // roam: simple wander/jump across the dragon-band platforms (1..8 minus ground)
  const reachable = [1, 2, 3, 4, 5, 6, 7, 8];
  if (d.airborne) {
    d.vy += GRAVITY;
    d.x += d.vx;
    d.y += d.vy;
    d.x = Math.max(4, Math.min(CANVAS_W - DRAGON_W - 4, d.x));
    const tp = L4_PLATFORMS[d.targetPlatIdx];
    if (d.vy >= 0 && d.y + DRAGON_H >= tp.y && d.x + DRAGON_W > tp.x1 && d.x < tp.x2) {
      d.y = tp.y - DRAGON_H;
      d.vy = 0; d.vx = 0;
      d.airborne = false;
      d.platIdx = d.targetPlatIdx;
      d.jumpCooldown = 60 + Math.floor(Math.random() * 90);
    } else if (d.y > CANVAS_H + 40) {
      d.y = L4_PLATFORMS[0].y - DRAGON_H;
      d.platIdx = 0; d.airborne = false; d.vy = 0;
    }
    return;
  }

  const plat = L4_PLATFORMS[d.platIdx];
  const leftLim = plat.x1 + 2;
  const rightLim = plat.x2 - DRAGON_W - 2;
  const p = s.player;
  if (Math.random() < 0.02) d.facing = p.x < d.x ? -1 : 1;
  const speed = 0.9 * s.diff.dragonSpeedMul;
  d.x += d.facing * speed;
  if (d.x < leftLim) { d.x = leftLim; d.facing = 1; }
  if (d.x > rightLim) { d.x = rightLim; d.facing = -1; }
  d.y = plat.y - DRAGON_H;

  d.jumpCooldown--;
  if (d.jumpCooldown <= 0) {
    // Pick a random other reachable platform; aim a hop toward it.
    const choices = reachable.filter(i => i !== d.platIdx);
    const tgt = choices[Math.floor(Math.random() * choices.length)];
    const tp = L4_PLATFORMS[tgt];
    const tcx = (tp.x1 + tp.x2) / 2;
    const dx = tcx - (d.x + DRAGON_W / 2);
    const dy = tp.y - (d.y + DRAGON_H);
    d.targetPlatIdx = tgt;
    d.airborne = true;
    d.vy = dy < 0 ? -7.5 : -3.5;
    d.vx = Math.max(-2.5, Math.min(2.5, dx / 40));
  }
}

// ── Player ──────────────────────────────────────────────────
function tickPlayer(s: L4State, input: L4Input) {
  const p = s.player;
  if (p.kickTimer > 0) p.kickTimer--;

  // Climbing detection
  let nearSprout: Sprout | null = null;
  let nearTopPlatIdx = -1;
  let nearBotPlatIdx = -1;
  const sproutHits: { sp: Sprout; topPlatIdx: number; botPlatIdx: number }[] = [
    { sp: s.sproutD, topPlatIdx: D_TOP_PLAT_IDX, botPlatIdx: D_BASE_PLAT_IDX },
    { sp: s.sproutE, topPlatIdx: E_TOP_PLAT_IDX, botPlatIdx: E_BASE_PLAT_IDX },
  ];
  for (const sh of sproutHits) {
    const sp = sh.sp;
    if (sp.growProgress < 0.6) continue;
    const cx = p.x + p.w / 2;
    const topReach = sp.yBot - (sp.yBot - sp.yTop) * sp.growProgress;
    if (Math.abs(cx - sp.x) < 12 && p.y + p.h >= topReach - 4 && p.y <= sp.yBot + 20) {
      nearSprout = sp; nearTopPlatIdx = sh.topPlatIdx; nearBotPlatIdx = sh.botPlatIdx;
    }
  }

  // Start climbing
  if (nearSprout && (input.up || input.down) && !p.climbing) {
    const topReach = nearSprout.yBot - (nearSprout.yBot - nearSprout.yTop) * nearSprout.growProgress;
    const atTop = Math.abs((p.y + p.h) - topReach) < 4;
    const atBot = Math.abs((p.y + p.h) - nearSprout.yBot) < 4;
    if ((input.up && !atTop) || (input.down && !atBot) || (!atTop && !atBot)) {
      p.climbing = true;
      p.x = nearSprout.x - p.w / 2;
      p.vy = 0;
    }
  }

  if (p.climbing) {
    if (!nearSprout) p.climbing = false;
    else {
      nearSprout.inUse = true;
      const topReach = nearSprout.yBot - (nearSprout.yBot - nearSprout.yTop) * nearSprout.growProgress;
      if (input.up) p.y -= CLIMB_SPEED;
      else if (input.down) p.y += CLIMB_SPEED;
      p.x = nearSprout.x - p.w / 2;
      p.vy = 0; p.onGround = false; p.jumping = false;
      p.climbTimer++;
      if (p.climbTimer >= 8) { p.climbTimer = 0; p.climbFrame = (p.climbFrame + 1) % 2; }

      // Dismount sideways when aligned with a platform
      if (input.left || input.right) {
        const foot = p.y + p.h;
        const atTopPlat = Math.abs(foot - topReach) < 8;
        const atBotPlat = Math.abs(foot - nearSprout.yBot) < 8;
        if (atTopPlat || atBotPlat) {
          p.y = (atTopPlat ? topReach : nearSprout.yBot) - p.h;
          p.climbing = false;
          p.onGround = true;
          p.groundPlatIdx = atTopPlat ? nearTopPlatIdx : nearBotPlatIdx;
        } else {
          return;
        }
      } else {
        // Hit top
        if (input.up && p.y + p.h <= topReach + 2) {
          p.y = L4_PLATFORMS[nearTopPlatIdx].y - p.h;
          p.climbing = false; p.onGround = true; p.groundPlatIdx = nearTopPlatIdx;
        }
        // Hit bottom
        if (input.down && p.y + p.h >= nearSprout.yBot) {
          p.y = nearSprout.yBot - p.h;
          p.climbing = false; p.onGround = true; p.groundPlatIdx = nearBotPlatIdx;
        }
        return;
      }
    }
  }

  // Horizontal
  if (input.left) { p.vx = -MOVE_SPEED; p.facing = -1; }
  else if (input.right) { p.vx = MOVE_SPEED; p.facing = 1; }
  else p.vx = 0;

  // Jump / KICK at A
  if (input.jump && p.onGround && p.kickTimer === 0) {
    // KICK check first: standing on kick ledge near A with rock at A
    if (p.groundPlatIdx === KICK_LEDGE_IDX && s.rockAtAIdx >= 0) {
      const rock = s.rocks[s.rockAtAIdx];
      const cx = p.x + p.w / 2;
      if (Math.abs(cx - rock.x) < 22) {
        // Kick! Rock starts falling.
        rock.state = 'falling';
        rock.vy = 0.5;
        rock.vx = 0;
        rock.hitConsumed = false;
        s.rockAtAIdx = -1;
        p.kickTimer = 18;
      } else {
        p.vy = JUMP_FORCE;
        p.onGround = false; p.jumping = true;
        p.jumpStartPlatIdx = p.groundPlatIdx;
      }
    }
    // WATER E: standing on kick ledge near E while carrying purple can
    else if (p.groundPlatIdx === KICK_LEDGE_IDX && s.carrying === 'purple') {
      const cx = p.x + p.w / 2;
      if (Math.abs(cx - E_X) < 22) {
        // Grow E by 1/X
        if (s.sproutE.phase === 'seed') { s.sproutE.phase = 'growing'; s.sproutE.growProgress = 0; }
        s.sproutE.growProgress = Math.min(1, s.sproutE.growProgress + s.eGrowChunk);
        if (s.sproutE.growProgress >= 1) { s.sproutE.phase = 'alive'; }
        s.carrying = null;
        // Re-seed D
        s.sproutD.phase = 'withering';
        // If hits<X, respawn monkeys so player can earn another green can
        if (s.dragon.hits < s.diff.hitsToKill) respawnMonkeyWave(s);
      } else {
        p.vy = JUMP_FORCE; p.onGround = false; p.jumping = true; p.jumpStartPlatIdx = p.groundPlatIdx;
      }
    }
    // WATER D: standing on D's base platform near D while carrying green can
    else if (p.groundPlatIdx === D_BASE_PLAT_IDX && s.carrying === 'green') {
      const cx = p.x + p.w / 2;
      if (Math.abs(cx - D_X) < 22) {
        if (s.sproutD.phase === 'seed' || s.sproutD.phase === 'withering') {
          s.sproutD.phase = 'growing';
        }
        s.carrying = null;
      } else {
        p.vy = JUMP_FORCE; p.onGround = false; p.jumping = true; p.jumpStartPlatIdx = p.groundPlatIdx;
      }
    }
    else {
      p.vy = JUMP_FORCE;
      p.onGround = false; p.jumping = true;
      p.jumpStartPlatIdx = p.groundPlatIdx;
    }
  }

  // Gravity
  p.vy += GRAVITY;
  p.x += p.vx;
  p.y += p.vy;
  p.x = Math.max(0, Math.min(CANVAS_W - p.w, p.x));

  // Platform collisions — only the platform we started the jump on,
  // OR any platform when not jumping.
  const wasOnGround = p.onGround;
  p.onGround = false;
  const limitIdx = p.jumping ? p.jumpStartPlatIdx : -1;
  for (let i = 0; i < L4_PLATFORMS.length; i++) {
    if (limitIdx >= 0 && i !== limitIdx) continue;
    const plat = L4_PLATFORMS[i];
    if (p.x + p.w < plat.x1 || p.x > plat.x2) continue;
    const wasAbove = (p.y + p.h - p.vy) <= plat.y + 1;
    if (wasAbove && p.y + p.h >= plat.y && p.y + p.h <= plat.y + 12 && p.vy >= 0) {
      p.y = plat.y - p.h;
      p.vy = 0;
      p.onGround = true;
      p.groundPlatIdx = i;
      p.jumping = false;
      break;
    }
  }
  // If walked off an edge, allow fall (don't snap back to ground).
  if (wasOnGround && !p.onGround && !p.jumping) {
    // free-fall continues
  }

  // Anim
  if (p.onGround && Math.abs(p.vx) > 0.1) {
    p.walkTimer++;
    if (p.walkTimer >= 6) { p.walkTimer = 0; p.walkFrame = (p.walkFrame + 1) % 4; }
  } else if (!p.jumping) p.walkFrame = 0;
  if (p.jumping) {
    p.jumpTimer++;
    if (p.jumpTimer >= 8) { p.jumpTimer = 0; p.jumpFrame = Math.min(2, p.jumpFrame + 1); }
  }
}

// ── Cans ────────────────────────────────────────────────────
function tickCans(s: L4State) {
  const p = s.player;
  const pickup = (c: Can | null): boolean => {
    if (!c || c.picked || s.carrying) return false;
    if (Math.abs((p.x + p.w / 2) - (c.x + 7)) < 16 && Math.abs((p.y + p.h) - (c.y + 14)) < 22) {
      c.picked = true;
      s.carrying = c.color;
      return true;
    }
    return false;
  };
  if (pickup(s.greenCan)) s.greenCan = null;
  if (pickup(s.purpleCan)) s.purpleCan = null;
}

// ── Collisions ──────────────────────────────────────────────
function tickCollisions(s: L4State) {
  const p = s.player;
  const d = s.dragon;

  // Rock vs Dragon (only "falling" rocks hit dragon)
  for (const r of s.rocks) {
    if (r.state !== 'falling') continue;
    if (r.hitConsumed) continue;
    if (d.state === 'roam' || d.state === 'downed') {
      const dw = DRAGON_W, dh = DRAGON_H;
      if (r.x > d.x && r.x < d.x + dw && r.y + r.r > d.y && r.y - r.r < d.y + dh) {
        r.hitConsumed = true;
        r.state = 'dead';
        d.hits++;
        d.state = 'downed';
        d.downedTimer = Math.round(5 * 60);
        // Spawn purple can
        if (!s.purpleCan) spawnCan(s, 'purple');
      }
    }
  }

  // Rocks vs player (hazardous when not falling toward dragon)
  if (s.invuln <= 0) {
    for (const r of s.rocks) {
      if (r.state === 'restingAtA' || r.state === 'dead') continue;
      const dx = (p.x + p.w / 2) - r.x;
      const dy = (p.y + p.h / 2) - r.y;
      if (dx * dx + dy * dy < (r.r + 8) * (r.r + 8)) {
        // Falling rock from A is also dangerous to player on lower bands
        loseLife(s); break;
      }
    }
  }

  // Dragon touch
  if (s.invuln <= 0 && (d.state === 'roam')) {
    if (p.x < d.x + DRAGON_W && p.x + p.w > d.x && p.y < d.y + DRAGON_H && p.y + p.h > d.y) {
      loseLife(s);
    }
  }

  // Monkeys
  for (const m of s.monkeys) {
    if (!m.alive) continue;
    if (p.x < m.x + 14 && p.x + p.w > m.x && p.y < m.y + 16 && p.y + p.h > m.y) {
      if (p.vy > 0 && (p.y + p.h) < m.y + 12) {
        m.alive = false;
        p.vy = JUMP_FORCE * 0.8;
      } else if (s.invuln <= 0) {
        loseLife(s);
      }
    }
  }

  // Win check: caveman on princess platform touching princess (only after dragon dead)
  if (d.state === 'dead' && Math.abs(p.y + p.h - L4_PLATFORMS[PRINCESS_PLAT_IDX].y) < 6) {
    if (p.x < s.princessX + PRINCESS_W && p.x + p.w > s.princessX) {
      if (!s.ending.active) {
        s.ending.active = true;
        s.ending.phase = 'hug';
        s.ending.timer = 0;
      }
    }
  }
}

function loseLife(s: L4State) {
  if (s.dying) return;
  s.dying = true;
  s.deathTimer = 0;
  s.deathReported = false;
}

// ── Ending ──────────────────────────────────────────────────
function tickEnding(s: L4State) {
  const e = s.ending;
  e.timer++;
  switch (e.phase) {
    case 'hug':
      if (e.timer >= 120) { e.phase = 'pause'; e.timer = 0; }
      break;
    case 'pause':
      if (e.timer >= 120) { e.phase = 'kidnap'; e.timer = 0; e.newDragonX = -DRAGON_W; }
      break;
    case 'kidnap':
      e.newDragonX += 3;
      if (e.newDragonX > s.princessX) s.princessX = e.newDragonX + 6;
      if (e.newDragonX > CANVAS_W + 40) { e.phase = 'follow'; e.timer = 0; }
      break;
    case 'follow':
      s.player.x += 2;
      if (s.player.x > CANVAS_W + 20) { e.phase = 'done'; s.won = true; }
      break;
    case 'done':
      break;
  }
}

// ── Render ──────────────────────────────────────────────────
export function renderLevel4(ctx: CanvasRenderingContext2D, s: L4State, sprites: L4Sprites) {
  ctx.save();
  ctx.fillStyle = '#0a0010';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  // Stars
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 24; i++) {
    const sx = (i * 71) % CANVAS_W;
    const sy = (i * 53) % 100;
    ctx.fillRect(sx, sy, 1, 1);
  }

  // Platforms
  for (const plat of L4_PLATFORMS) {
    ctx.fillStyle = '#6B4226';
    ctx.fillRect(plat.x1, plat.y + 2, plat.x2 - plat.x1, 6);
    ctx.fillStyle = '#3CB043';
    ctx.fillRect(plat.x1, plat.y, plat.x2 - plat.x1, 3);
  }

  // Volcano (top-right of princess platform)
  drawVolcano(ctx, VOLCANO_X, L4_PLATFORMS[10].y);

  // Princess
  if (sprites.princess.complete) {
    ctx.drawImage(sprites.princess, 0, 0, sprites.princess.width / 5, sprites.princess.height,
      s.princessX, s.princessY, PRINCESS_W, PRINCESS_H);
  } else {
    ctx.fillStyle = '#ff80c0'; ctx.fillRect(s.princessX, s.princessY, PRINCESS_W, PRINCESS_H);
  }

  // Sprouts
  drawSprout(ctx, s.sproutD);
  drawSprout(ctx, s.sproutE);

  // Cans
  if (s.greenCan) drawCan(ctx, sprites, s.greenCan);
  if (s.purpleCan) drawCan(ctx, sprites, s.purpleCan);

  // Carrying icon above player
  if (s.carrying) {
    const p = s.player;
    ctx.fillStyle = s.carrying === 'green' ? '#3CB043' : '#9b59b6';
    ctx.fillRect(p.x - 1, p.y - 10, 18, 8);
  }

  // Dragon
  drawDragon(ctx, sprites, s.dragon);

  // Monkeys
  for (const m of s.monkeys) {
    if (!m.alive) continue;
    const img = sprites.robotWalk;
    const drawW = MONKEY_DRAW_W, drawH = MONKEY_DRAW_H;
    const cx = m.x + 7;
    const feetY = m.y + 16;
    const dx = cx - drawW / 2;
    const dy = feetY - drawH;
    if (img.complete && img.naturalWidth > 0) {
      const fw = img.naturalWidth / ROBOT_FRAMES;
      const fh = img.naturalHeight;
      ctx.save();
      if (m.facing < 0) {
        ctx.translate(cx, 0); ctx.scale(-1, 1);
        ctx.drawImage(img, m.walkFrame * fw, 0, fw, fh, -drawW / 2, dy, drawW, drawH);
      } else {
        ctx.drawImage(img, m.walkFrame * fw, 0, fw, fh, dx, dy, drawW, drawH);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = '#9b59b6'; ctx.fillRect(dx, dy, drawW, drawH);
    }
  }

  // Rocks
  for (const r of s.rocks) {
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.age * 0.2);
    if (sprites.rockWheel.complete) {
      ctx.drawImage(sprites.rockWheel, -r.r, -r.r, r.r * 2, r.r * 2);
    } else {
      ctx.fillStyle = '#888';
      ctx.beginPath(); ctx.arc(0, 0, r.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Player
  const p = s.player;
  const blink = s.dying ? Math.floor(s.deathTimer / 18) % 2 !== 0 : (s.invuln > 0 && (s.invuln % 8 < 4));
  if (!blink) {
    let img: HTMLImageElement = sprites.cavemanWalk;
    let frame = p.walkFrame; let frames = 4;
    if (p.climbing) { img = sprites.cavemanClimb; frame = p.climbFrame % 4; frames = 4; }
    else if (p.jumping || p.kickTimer > 0) { img = sprites.cavemanJump; frame = Math.min(p.jumpFrame, 4); frames = 5; }
    const drawW = PLAYER_DRAW_W, drawH = PLAYER_DRAW_H;
    const cx = p.x + p.w / 2;
    const feetY = p.y + p.h;
    const dx = cx - drawW / 2;
    const dy = feetY - drawH;
    if (img.complete && img.naturalWidth > 0) {
      const fw = img.naturalWidth / frames;
      const fh = img.naturalHeight;
      ctx.save();
      if (p.facing < 0) {
        ctx.translate(cx, 0); ctx.scale(-1, 1);
        ctx.drawImage(img, frame * fw, 0, fw, fh, -drawW / 2, dy, drawW, drawH);
      } else {
        ctx.drawImage(img, frame * fw, 0, fw, fh, dx, dy, drawW, drawH);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = '#deb887'; ctx.fillRect(dx, dy, drawW, drawH);
    }
  }

  // HUD: dragon hits remaining
  const total = s.diff.hitsToKill;
  const remaining = Math.max(0, total - s.dragon.hits);
  const slotW = 18, slotH = 14, slotY = CANVAS_H - 22, slotX0 = 8;
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i < remaining ? '#9b59b6' : '#2c2c2c';
    ctx.fillRect(slotX0 + i * (slotW + 4), slotY, slotW, slotH);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(slotX0 + i * (slotW + 4), slotY, slotW, slotH);
  }

  // Ending overlay
  if (s.ending.active) {
    const e = s.ending;
    if (e.phase === 'hug' || e.phase === 'pause') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(140, 60, 180, 36);
      ctx.fillStyle = '#000';
      ctx.font = '14px sans-serif';
      ctx.fillText('Thank you, my hero!', 158, 84);
    }
    if (e.phase === 'kidnap') {
      const img = sprites.dragonAngry;
      if (img.complete) {
        const fw = img.width / 5;
        ctx.drawImage(img, 0, 0, fw, img.height, e.newDragonX, s.princessY - 4, DRAGON_W, DRAGON_H);
      } else {
        ctx.fillStyle = '#700'; ctx.fillRect(e.newDragonX, s.princessY, DRAGON_W, DRAGON_H);
      }
    }
  }

  ctx.restore();
}

function drawSprout(ctx: CanvasRenderingContext2D, sp: Sprout) {
  if (sp.growProgress <= 0) return;
  const full = sp.yBot - sp.yTop;
  const len = full * sp.growProgress;
  const top = sp.yBot - len;
  const bot = sp.yBot;
  const purple = sp.isPurple;
  const stemMain = purple ? '#7B1FA2' : '#2E7D32';
  const stemEdge = purple ? '#BA68C8' : '#4CAF50';
  const leaf = purple ? '#CE93D8' : '#66BB6A';
  const lx = sp.x - 7;
  ctx.strokeStyle = stemMain; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let y = top; y <= bot; y += 4) {
    const wave = Math.sin(y * 0.4) * 1.5;
    if (y === top) ctx.moveTo(lx + wave, y); else ctx.lineTo(lx + wave, y);
  }
  ctx.stroke();
  ctx.beginPath();
  for (let y = top; y <= bot; y += 4) {
    const wave = Math.sin(y * 0.4 + 1) * 1.5;
    if (y === top) ctx.moveTo(lx + 14 + wave, y); else ctx.lineTo(lx + 14 + wave, y);
  }
  ctx.stroke();
  ctx.strokeStyle = stemEdge; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(lx - 1, top); ctx.lineTo(lx - 1, bot);
  ctx.moveTo(lx + 13, top); ctx.lineTo(lx + 13, bot);
  ctx.stroke();
  for (let y = top + 4; y < bot; y += 12) {
    ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx + 1, y); ctx.lineTo(lx + 13, y);
    ctx.stroke();
    ctx.fillStyle = leaf;
    ctx.fillRect(lx + 3, y - 2, 2, 2);
    ctx.fillRect(lx + 9, y + 1, 2, 2);
  }
}

function drawCan(ctx: CanvasRenderingContext2D, sprites: L4Sprites, c: Can) {
  if (sprites.wateringCan.complete) {
    ctx.drawImage(sprites.wateringCan, c.x - 2, c.y, 18, 14);
    if (c.color === 'purple') {
      ctx.save(); ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#9b59b6';
      ctx.fillRect(c.x - 2, c.y, 18, 14);
      ctx.restore();
    }
  } else {
    ctx.fillStyle = c.color === 'green' ? '#3CB043' : '#9b59b6';
    ctx.fillRect(c.x - 2, c.y, 18, 14);
  }
}

function drawDragon(ctx: CanvasRenderingContext2D, sprites: L4Sprites, d: Dragon) {
  if (d.state === 'dead') return;
  const img = sprites.dragonAngry && sprites.dragonAngry.complete && sprites.dragonAngry.naturalWidth > 0
    ? sprites.dragonAngry : sprites.dragonFire;
  ctx.save();
  if (d.state === 'downed') ctx.globalAlpha = 0.7;
  if (d.state === 'dying') ctx.globalAlpha = 0.5;
  if (img && img.complete && img.naturalWidth > 0) {
    const fw = img.naturalWidth / DRAGON_FRAMES;
    const fh = img.naturalHeight;
    const frame = d.frame % DRAGON_FRAMES;
    if (d.facing < 0) {
      ctx.translate(d.x + DRAGON_W, d.y); ctx.scale(-1, 1);
      ctx.drawImage(img, frame * fw, 0, fw, fh, 0, 0, DRAGON_W, DRAGON_H);
    } else {
      ctx.drawImage(img, frame * fw, 0, fw, fh, d.x, d.y, DRAGON_W, DRAGON_H);
    }
  } else {
    ctx.fillStyle = '#c0392b'; ctx.fillRect(d.x, d.y, DRAGON_W, DRAGON_H);
  }
  ctx.restore();
  // Stars when downed
  if (d.state === 'downed') {
    ctx.save();
    ctx.translate(d.x + DRAGON_W / 2, d.y - 8);
    for (let i = 0; i < 3; i++) {
      const a = (d.frame * 0.4) + (i * Math.PI * 2 / 3);
      const bx = Math.cos(a) * 14, by = Math.sin(a) * 6;
      ctx.fillStyle = '#ffeb3b';
      ctx.font = '12px sans-serif';
      ctx.fillText('★', bx - 4, by + 4);
    }
    ctx.restore();
  }
}

function drawVolcano(ctx: CanvasRenderingContext2D, baseCX: number, baseY: number) {
  const baseW = 80, volH = 50;
  const leftX = baseCX - baseW / 2, rightX = baseCX + baseW / 2;
  const peakLX = baseCX - 16, peakRX = baseCX + 16;
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
  ctx.fillStyle = '#ff6a1a';
  ctx.beginPath();
  ctx.ellipse(baseCX, peakY + 2, (peakRX - peakLX) / 2 - 3, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
}
