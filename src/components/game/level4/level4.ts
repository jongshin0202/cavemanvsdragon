// ============================================================
// Level 4 — Caveman vs Dragon (LAYOUT REBUILT FROM SKETCH)
// ------------------------------------------------------------
// Self-contained. No L1/L2/L3 imports beyond canvas size + L1
// difficulty curve for rock spawn cadence.
//
// Layout mirrors the annotated sketch:
//  Band 1 (princess top): princess 0, volcano K. Rock launches
//    from K, lands near point 3 (top-left), rolls RIGHT to C.
//    At C: if slot A empty → drops via L straight down to A.
//          Else → continues off right edge → cascades right ramps.
//  Band 2: left high stub, E-valley with E (purple sprout) + A
//    (rock rest slot), right high stub. Ramps connect bands.
//  Band 3 (dragon roam): D-base flat (left), tent center, right
//    flat. Two M movers fill the gaps. H2 ladder on right.
//  Band 4: left stub, center M mover, right stub above H2.
//    H1 ladder on left.
//  Band 5: F-flat (left) + paired M movers bouncing at N +
//    G-flat (right). H3 ladder on right.
//  Band 6: caveman 1 spawn (left ground), center M mover,
//    right ground.
//
// Sprouts (D, E, H1, H2, H3) all use L2-style wither/regrow
// cycle (local copy). E only grows when watered with purple
// can (+1/iter each).
// ============================================================

import { CANVAS_W, CANVAS_H, getRoundDifficulty } from '../constants';
import { LEVEL4_PARAMS, getLevel4Difficulty, type Level4Difficulty } from './params';

const GRAVITY = 0.38;
const MOVE_SPEED = 1.9;
const JUMP_FORCE = -5.2;
const CLIMB_SPEED = 1.5;

// ── Layout ───────────────────────────────────────────────────
// Platforms can be SLOPED. `y` is the y at x1; if `slope` is set,
// y at any x in [x1,x2] = y + (x - x1) * slope.
export interface L4Mover {
  min: number;
  max: number;
  speed: number;
  pairIdx?: number;
}
export interface L4Platform {
  y: number;
  x1: number;
  x2: number;
  slope?: number;
  moving?: L4Mover;
}

function platY(p: L4Platform, x: number): number {
  const cx = Math.max(p.x1, Math.min(p.x2, x));
  return p.y + (cx - p.x1) * (p.slope || 0);
}

// Band Y rows — EQUAL spacing of 76px between every band.
//  B1=80  B2=156  B3=232  B4=308  B5=384  B6=460
export const L4_PLATFORMS: L4Platform[] = [
  // ── Band 1 (Princess + Volcano top) ──
  /*  0 PRINCESS_TOP   */ { y: 80,  x1: 64,  x2: 432 },

  // ── Band 2 (flat — E sprout + rock-rest A) ──
  /*  1 B2_FLAT        */ { y: 156, x1: 0,   x2: 512 },

  // ── Band 3 (D-flat ← gap (tent recess) → right-flat) ──
  /*  2 D_FLAT         */ { y: 232, x1: 0,   x2: 144 },
  /*  3 TENT_LEFT_LEG  */ { y: 232, x1: 144, x2: 224, slope: (308 - 232) / (224 - 144) },
  /*  4 TENT_TOP       */ { y: 308, x1: 224, x2: 288 },
  /*  5 TENT_RIGHT_LEG */ { y: 308, x1: 288, x2: 368, slope: (232 - 308) / (368 - 288) },
  /*  6 RIGHT_B3       */ { y: 232, x1: 368, x2: 512 },

  // ── Band 4 (stubs + tent recess movers) ──
  /*  7 LEFT_B4        */ { y: 308, x1: 0,   x2: 100 },
  /*  8 RIGHT_B4       */ { y: 308, x1: 412, x2: 512 },
  /*  9 M_B4_L         */ { y: 308, x1: 100, x2: 140 },
  /* 10 M_B4_R         */ { y: 308, x1: 372, x2: 412 },

  // ── Band 5 (F flat + ramp inward; N-pair; G flat + ramp inward) ──
  /* 11 LEFT_B5        */ { y: 384, x1: 0,   x2: 132 },
  /* 12 LEFT_B5_RAMP   */ { y: 384, x1: 132, x2: 188, slope: (460 - 384) / (188 - 132) },
  /* 13 RIGHT_B5_RAMP  */ { y: 460, x1: 324, x2: 380, slope: (384 - 460) / (380 - 324) },
  /* 14 RIGHT_B5       */ { y: 384, x1: 380, x2: 512 },
  /* 15 M_B5_L         */ { y: 384, x1: 132, x2: 172 },
  /* 16 M_B5_R         */ { y: 384, x1: 340, x2: 380 },

  // ── Band 6 (ground) ──
  /* 17 LEFT_GROUND    */ { y: 460, x1: 0,   x2: 188 },
  /* 18 RIGHT_GROUND   */ { y: 460, x1: 324, x2: 512 },
  /* 19 M_B6           */ { y: 460, x1: 188, x2: 228 },
];

// Helper for random speed in [min,max] with random sign.
function rsp(lo: number, hi: number): number {
  return (Math.random() < 0.5 ? -1 : 1) * (lo + Math.random() * (hi - lo));
}
// Random magnitude only (caller picks sign).
function rmag(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

// Mover bounds: min/max are the LEFT-edge range; bounded by neighbour
// steady-platform edges so movers bounce off solid platforms.
L4_PLATFORMS[9].moving  = { min: 100, max: 184, speed: rsp(0.5, 1.1) };
L4_PLATFORMS[10].moving = { min: 288, max: 372, speed: rsp(0.5, 1.1) };
// N-pair: start moving TOWARD each other, different random speeds.
L4_PLATFORMS[15].moving = { min: 132, max: 232, speed:  rmag(0.6, 1.2), pairIdx: 16 };
L4_PLATFORMS[16].moving = { min: 280, max: 380, speed: -rmag(0.6, 1.2), pairIdx: 15 };
L4_PLATFORMS[19].moving = { min: 188, max: 284, speed: rsp(0.5, 1.0) };

// Named anchors
const PRINCESS_X = 100;
const PRINCESS_Y = L4_PLATFORMS[0].y - 48;
const VOLCANO_X  = 380;
const C_X = 380;
const E_X = 260;
const A_X = 300;
const D_X = 40;

const PRINCESS_PLAT_IDX = 0;
const E_BASE_PLAT_IDX   = 1;   // B2_FLAT
const E_TOP_PLAT_IDX    = 0;   // PRINCESS_TOP
const D_BASE_PLAT_IDX   = 2;   // D_FLAT
const D_TOP_PLAT_IDX    = 1;   // B2_FLAT
const A_PLAT_IDX        = 1;   // B2_FLAT

// H ladder sprouts (each spans exactly one band gap)
const H1_X = 60,  H1_TOP_IDX = 7,  H1_BOT_IDX = 11;  // LEFT_B4 → LEFT_B5
const H2_X = 470, H2_TOP_IDX = 6,  H2_BOT_IDX = 8;   // RIGHT_B3 → RIGHT_B4
const H3_X = 490, H3_TOP_IDX = 14, H3_BOT_IDX = 18;  // RIGHT_B5 → RIGHT_GROUND

const MONKEY_PLAT_ANCHORS: number[] = [
  2, 6, 7, 8, 9, 10, 11, 14, 17, 18, 19,
];
const MONKEY_PER_PLAT_CAP = 5;
const MONKEY_TOTAL_CAP    = 20;

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
  yTop: number;
  yBot: number;
  isPurple: boolean;
  phase: SproutPhase;
  growProgress: number;
  aliveTimer: number;
  regrowTimer: number;
  inUse?: boolean;
  /** Index into L4_PLATFORMS for top platform (for dismount). */
  topPlatIdx: number;
  botPlatIdx: number;
  /** If true, never auto-withers (E behaves this way). */
  noAutoWither?: boolean;
  /** If true, partial growth allowed (only fills by `growChunk` per watering). */
  partialGrow?: boolean;
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
  kickTimer: number;
}

type RockState = 'flying' | 'rollingTop' | 'restingAtA' | 'falling' | 'rollingDown' | 'dead';
interface Rock {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  state: RockState;
  platIdx: number;
  age: number;
  hitConsumed?: boolean;
}

type DragonState = 'intro' | 'roam' | 'downed' | 'dying' | 'dead';
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
  sproutH1: Sprout;
  sproutH2: Sprout;
  sproutH3: Sprout;
  greenCan: Can | null;
  purpleCan: Can | null;
  carrying: null | 'green' | 'purple';
  eGrowChunk: number;
  greenCanSpawned: boolean;
  rockAtAIdx: number;
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

// ── Helpers ──────────────────────────────────────────────────
function mkSprout(x: number, topIdx: number, botIdx: number, opts: { purple?: boolean; noAutoWither?: boolean; partialGrow?: boolean } = {}): Sprout {
  return {
    x,
    yTop: L4_PLATFORMS[topIdx].y,
    yBot: L4_PLATFORMS[botIdx].y,
    isPurple: !!opts.purple,
    phase: 'seed',
    growProgress: 0,
    aliveTimer: 0,
    regrowTimer: 0,
    topPlatIdx: topIdx,
    botPlatIdx: botIdx,
    noAutoWither: !!opts.noAutoWither,
    partialGrow: !!opts.partialGrow,
  };
}

function buildMonkeyDistribution(iter: number): number[] {
  // L1-style: round-robin onto platform with current min count, cap per-plat=5, total cap=20.
  const counts = new Array<number>(MONKEY_PLAT_ANCHORS.length).fill(0);
  const total = Math.min(MONKEY_TOTAL_CAP, LEVEL4_PARAMS.MONKEYS_BASE + Math.max(0, iter - 1));
  for (let i = 0; i < total; i++) {
    let min = Infinity;
    for (let j = 0; j < counts.length; j++) {
      if (counts[j] < MONKEY_PER_PLAT_CAP && counts[j] < min) min = counts[j];
    }
    const cand: number[] = [];
    for (let j = 0; j < counts.length; j++) {
      if (counts[j] === min && counts[j] < MONKEY_PER_PLAT_CAP) cand.push(j);
    }
    if (!cand.length) break;
    counts[cand[Math.floor(Math.random() * cand.length)]]++;
  }
  return counts;
}

function makeMonkey(platIdx: number): Monkey {
  const plat = L4_PLATFORMS[platIdx];
  const w = plat.x2 - plat.x1;
  const mx = plat.x1 + 16 + Math.random() * Math.max(8, w - 40);
  return {
    alive: true,
    x: mx,
    y: platY(plat, mx) - 16,
    platIdx,
    vx: (Math.random() < 0.5 ? -1 : 1) * 0.55,
    facing: 1,
    walkFrame: 0, walkTimer: 0,
  };
}

// ── Init ─────────────────────────────────────────────────────
export function initLevel4(iter: number): L4State {
  const diff = getLevel4Difficulty(iter);

  // Randomize mover speeds + reset positions each iteration.
  const randomizeMover = (idx: number, speed: number) => {
    const pl = L4_PLATFORMS[idx];
    if (!pl.moving) return;
    const w = pl.x2 - pl.x1;
    const startX = pl.moving.min + Math.random() * (pl.moving.max - pl.moving.min);
    pl.x1 = startX; pl.x2 = startX + w;
    pl.moving.speed = speed;
  };
  randomizeMover(9,  rsp(0.5, 1.1));
  randomizeMover(10, rsp(0.5, 1.1));
  // N-pair: opposite directions, different magnitudes.
  randomizeMover(15,  rmag(0.6, 1.2));
  randomizeMover(16, -rmag(0.6, 1.2));
  randomizeMover(19, rsp(0.5, 1.0));

  // Caveman on LEFT_GROUND (idx 17).
  const player: Player = {
    x: 20, y: platY(L4_PLATFORMS[17], 20) - 24, w: 16, h: 24,
    vx: 0, vy: 0, onGround: true, groundPlatIdx: 17, jumpStartPlatIdx: 17,
    climbing: false, facing: 1, jumping: false,
    walkFrame: 0, walkTimer: 0, jumpFrame: 0, jumpTimer: 0,
    climbFrame: 0, climbTimer: 0, kickTimer: 0,
  };

  // Dragon spawns next to princess on PRINCESS_TOP, then intro-jumps to TENT_TOP (idx 4).
  const dragon: Dragon = {
    x: 140, y: L4_PLATFORMS[0].y - DRAGON_H,
    vx: 0, vy: 0, airborne: false,
    platIdx: 0, targetPlatIdx: 4,
    facing: -1, jumpCooldown: 60,
    state: 'intro', downedTimer: 0, dyingTimer: 0, hits: 0,
    frame: 0, frameTimer: 0,
  };

  // Monkeys via L1-style distribution.
  const dist = buildMonkeyDistribution(iter);
  const monkeys: Monkey[] = [];
  for (let i = 0; i < dist.length; i++) {
    for (let k = 0; k < dist[i]; k++) monkeys.push(makeMonkey(MONKEY_PLAT_ANCHORS[i]));
  }

  return {
    iter,
    diff,
    tick: 0,
    player,
    dragon,
    monkeys,
    rocks: [],
    spawnRockTimer: 90,
    sproutD: mkSprout(D_X, D_TOP_PLAT_IDX, D_BASE_PLAT_IDX),
    sproutE: mkSprout(E_X, E_TOP_PLAT_IDX, E_BASE_PLAT_IDX, { purple: true, noAutoWither: true, partialGrow: true }),
    sproutH1: mkSprout(H1_X, H1_TOP_IDX, H1_BOT_IDX),
    sproutH2: mkSprout(H2_X, H2_TOP_IDX, H2_BOT_IDX),
    sproutH3: mkSprout(H3_X, H3_TOP_IDX, H3_BOT_IDX),
    greenCan: null,
    purpleCan: null,
    carrying: null,
    eGrowChunk: 1 / Math.max(1, diff.hitsToKill),
    greenCanSpawned: false,
    rockAtAIdx: -1,
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
  p.x = 20; p.y = platY(L4_PLATFORMS[17], 20) - 24;
  p.vx = 0; p.vy = 0;
  p.onGround = true; p.climbing = false; p.jumping = false;
  p.groundPlatIdx = 17; p.jumpStartPlatIdx = 17;
  p.facing = 1; p.kickTimer = 0;
}

// ── Moving platforms ────────────────────────────────────────
function tickMovingPlatforms(s: L4State) {
  // First pass: tentative move + bounce off own min/max.
  for (let i = 0; i < L4_PLATFORMS.length; i++) {
    const pl = L4_PLATFORMS[i];
    if (!pl.moving) continue;
    const w = pl.x2 - pl.x1;
    let nx = pl.x1 + pl.moving.speed;
    if (nx < pl.moving.min) { nx = pl.moving.min; pl.moving.speed = Math.abs(pl.moving.speed); }
    if (nx + w > pl.moving.max + w) { /* unreachable: max stored as left edge max */ }
    // Use max as the maximum LEFT edge (so platform stays within [min, max]).
    if (nx > pl.moving.max) { nx = pl.moving.max; pl.moving.speed = -Math.abs(pl.moving.speed); }
    pl.x1 = nx;
    pl.x2 = nx + w;
  }
  // Second pass: paired bounce (N).
  for (let i = 0; i < L4_PLATFORMS.length; i++) {
    const pl = L4_PLATFORMS[i];
    if (!pl.moving || pl.moving.pairIdx === undefined) continue;
    const j = pl.moving.pairIdx;
    if (j <= i) continue;
    const other = L4_PLATFORMS[j];
    if (!other.moving) continue;
    // If they overlap, separate them and reverse both directions.
    if (pl.x2 > other.x1 && pl.x1 < other.x2) {
      const overlap = pl.x2 - other.x1;
      pl.x1 -= overlap / 2; pl.x2 -= overlap / 2;
      other.x1 += overlap / 2; other.x2 += overlap / 2;
      pl.moving.speed = -Math.abs(pl.moving.speed);
      other.moving.speed = Math.abs(other.moving.speed);
    }
  }
}

// ── Rocks ───────────────────────────────────────────────────
function tickRocks(s: L4State) {
  s.spawnRockTimer--;
  if (s.spawnRockTimer <= 0) {
    const round = 1 + (s.iter - 1) * 4;
    const d = getRoundDifficulty(round);
    s.spawnRockTimer = Math.round(d.barrelSpawnMin + Math.random() * d.barrelSpawnRange);
    // Launch from K, arc up and LEFT toward point 3 (landing zone on princess top-left).
    s.rocks.push({
      x: VOLCANO_X, y: L4_PLATFORMS[0].y - 36,
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
        const top = L4_PLATFORMS[0];
        if (r.vy > 0 && r.y + r.r >= top.y && r.x >= top.x1 && r.x <= top.x2) {
          r.y = top.y - r.r;
          r.vy = 0;
          r.vx = 1.4; // roll RIGHT toward C
          r.state = 'rollingTop';
          r.platIdx = 0;
        } else if (r.y > CANVAS_H + 30 || r.x < -30 || r.x > CANVAS_W + 30) {
          r.state = 'dead';
        }
        break;
      }
      case 'rollingTop': {
        r.x += r.vx;
        const top = L4_PLATFORMS[0];
        const aOccupied = s.rockAtAIdx >= 0 && s.rockAtAIdx !== i;
        if (!aOccupied && r.vx > 0 && r.x >= C_X) {
          // Drop straight down via L gap.
          r.x = C_X;
          r.state = 'falling';
          r.vy = 0; r.vx = 0;
          break;
        }
        // Off right edge → cascade
        if (r.x > top.x2 + 2) {
          r.state = 'rollingDown';
          r.vx = 1.0; r.vy = 0;
          r.platIdx = -1;
          break;
        }
        if (r.x < top.x1 - 2) { r.state = 'dead'; }
        break;
      }
      case 'falling': {
        r.vy += GRAVITY;
        r.y += r.vy;
        const ev = L4_PLATFORMS[E_BASE_PLAT_IDX];
        if (r.x >= ev.x1 && r.x <= ev.x2 && r.y + r.r >= ev.y) {
          r.y = ev.y - r.r;
          r.vy = 0;
          if (s.rockAtAIdx < 0) {
            r.x = A_X;
            r.state = 'restingAtA';
            r.platIdx = E_BASE_PLAT_IDX;
            s.rockAtAIdx = i;
          } else {
            r.state = 'rollingDown';
            r.vx = -1.2;
          }
          break;
        }
        if (r.y > CANVAS_H + 20) r.state = 'dead';
        break;
      }
      case 'restingAtA':
        break;
      case 'rollingDown': {
        r.vy += GRAVITY * 0.5;
        r.x += r.vx;
        r.y += r.vy;
        for (let pi = 0; pi < L4_PLATFORMS.length; pi++) {
          const pl = L4_PLATFORMS[pi];
          if (r.x < pl.x1 || r.x > pl.x2) continue;
          const py = platY(pl, r.x);
          if (r.vy > 0 && r.y + r.r >= py && r.y + r.r <= py + 10) {
            r.y = py - r.r;
            r.vy = 0;
            r.platIdx = pi;
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

function tickOneSprout(sp: Sprout) {
  switch (sp.phase) {
    case 'seed':
      // H sprouts (ladders) auto-regrow.
      if (!sp.isPurple && !sp.noAutoWither && !sp.partialGrow) {
        // D requires watering; H sprouts auto-regrow.
      }
      break;
    case 'growing':
      sp.growProgress = Math.min(1, sp.growProgress + 1 / LEVEL4_PARAMS.SPROUT_GROW_FRAMES);
      if (sp.growProgress >= 1) { sp.phase = 'alive'; sp.aliveTimer = rollAliveFrames(); }
      break;
    case 'alive':
      if (sp.noAutoWither) break;
      if (!sp.inUse) {
        sp.aliveTimer--;
        if (sp.aliveTimer <= 0) sp.phase = 'withering';
      }
      break;
    case 'withering':
      sp.growProgress = Math.max(0, sp.growProgress - 1 / LEVEL4_PARAMS.SPROUT_GROW_FRAMES);
      if (sp.growProgress <= 0) {
        sp.phase = 'seed';
        sp.growProgress = 0;
        sp.regrowTimer = rollRegrowFrames();
      }
      break;
  }
  // Auto-regrow ladder H sprouts (and D's L2-style behaviour wired via regrowTimer)
  if (sp.phase === 'seed' && sp.regrowTimer > 0) {
    sp.regrowTimer--;
    if (sp.regrowTimer <= 0) sp.phase = 'growing';
  }
  sp.inUse = false;
}

function tickSprouts(s: L4State) {
  // D requires a green watering (not auto-regrow when fully cycled).
  // We let D follow the same cycle; once it withers, it goes to seed and STAYS at seed
  // (regrowTimer stays 0). Re-water with green can → set phase='growing'.
  tickOneSprout(s.sproutD);
  // Block D auto-regrow:
  if (s.sproutD.phase === 'seed') s.sproutD.regrowTimer = 0;

  // E: only grows on watering. We still tick to keep growProgress correct.
  tickOneSprout(s.sproutE);

  // H1/H2/H3 auto-regrow.
  if (s.sproutH1.phase === 'seed' && s.sproutH1.regrowTimer <= 0 && s.sproutH1.growProgress === 0) {
    s.sproutH1.phase = 'growing';
  }
  if (s.sproutH2.phase === 'seed' && s.sproutH2.regrowTimer <= 0 && s.sproutH2.growProgress === 0) {
    s.sproutH2.phase = 'growing';
  }
  if (s.sproutH3.phase === 'seed' && s.sproutH3.regrowTimer <= 0 && s.sproutH3.growProgress === 0) {
    s.sproutH3.phase = 'growing';
  }
  tickOneSprout(s.sproutH1);
  tickOneSprout(s.sproutH2);
  tickOneSprout(s.sproutH3);
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
    m.y = platY(plat, m.x) - 16;
    m.walkTimer++;
    if (m.walkTimer >= 6) { m.walkTimer = 0; m.walkFrame = (m.walkFrame + 1) % ROBOT_FRAMES; }
  }
  if (!s.greenCanSpawned && !s.greenCan && s.dragon.state !== 'dead' && s.monkeys.every(m => !m.alive)) {
    spawnCan(s, 'green');
    s.greenCanSpawned = true;
  }
}

function spawnCan(s: L4State, color: 'green' | 'purple') {
  const candidates = MONKEY_PLAT_ANCHORS;
  const pi = candidates[Math.floor(Math.random() * candidates.length)];
  const pl = L4_PLATFORMS[pi];
  const x = pl.x1 + 14 + Math.random() * Math.max(8, pl.x2 - pl.x1 - 32);
  const can: Can = { x, y: platY(pl, x) - 14, color, picked: false };
  if (color === 'green') s.greenCan = can; else s.purpleCan = can;
}

function respawnMonkeyWave(s: L4State) {
  const dist = buildMonkeyDistribution(s.iter);
  s.monkeys = [];
  for (let i = 0; i < dist.length; i++) {
    for (let k = 0; k < dist[i]; k++) s.monkeys.push(makeMonkey(MONKEY_PLAT_ANCHORS[i]));
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
  if (d.state === 'intro') {
    // Jump from princess top down to TENT_TOP (band 3 center).
    if (!d.airborne) {
      const tgt = 9;
      const tp = L4_PLATFORMS[tgt];
      const tcx = (tp.x1 + tp.x2) / 2;
      d.targetPlatIdx = tgt;
      d.airborne = true;
      d.vy = -2.0;
      d.vx = Math.max(-3, Math.min(3, (tcx - (d.x + DRAGON_W / 2)) / 60));
    }
    d.vy += GRAVITY;
    d.x += d.vx;
    d.y += d.vy;
    const tp = L4_PLATFORMS[d.targetPlatIdx];
    if (d.vy >= 0 && d.y + DRAGON_H >= tp.y && d.x + DRAGON_W > tp.x1 && d.x < tp.x2) {
      d.y = tp.y - DRAGON_H;
      d.vy = 0; d.vx = 0;
      d.airborne = false;
      d.platIdx = d.targetPlatIdx;
      d.state = 'roam';
      d.jumpCooldown = 90;
    } else if (d.y > CANVAS_H + 40) {
      // Safety net
      d.y = L4_PLATFORMS[9].y - DRAGON_H;
      d.x = (L4_PLATFORMS[9].x1 + L4_PLATFORMS[9].x2) / 2 - DRAGON_W / 2;
      d.airborne = false;
      d.platIdx = 9;
      d.state = 'roam';
    }
    return;
  }

  // Dragon roams band 3 platforms.
  const reachable = [7, 9, 11];
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
      d.y = L4_PLATFORMS[9].y - DRAGON_H;
      d.x = (L4_PLATFORMS[9].x1 + L4_PLATFORMS[9].x2) / 2 - DRAGON_W / 2;
      d.platIdx = 9; d.airborne = false; d.vy = 0;
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
    const choices = reachable.filter(i => i !== d.platIdx);
    const tgt = choices[Math.floor(Math.random() * choices.length)];
    const tp = L4_PLATFORMS[tgt];
    const tcx = (tp.x1 + tp.x2) / 2;
    const dx = tcx - (d.x + DRAGON_W / 2);
    const dy = tp.y - (d.y + DRAGON_H);
    d.targetPlatIdx = tgt;
    d.airborne = true;
    d.vy = dy < 0 ? -7.5 : -4.5;
    d.vx = Math.max(-3, Math.min(3, dx / 40));
  }
}

// ── Player ──────────────────────────────────────────────────
function tickPlayer(s: L4State, input: L4Input) {
  const p = s.player;
  if (p.kickTimer > 0) p.kickTimer--;

  // Climbing detection across D, E, H1, H2, H3
  let nearSprout: Sprout | null = null;
  const sproutList = [s.sproutD, s.sproutE, s.sproutH1, s.sproutH2, s.sproutH3];
  for (const sp of sproutList) {
    if (sp.growProgress < 0.6) continue;
    const cx = p.x + p.w / 2;
    const topReach = sp.yBot - (sp.yBot - sp.yTop) * sp.growProgress;
    if (Math.abs(cx - sp.x) < 12 && p.y + p.h >= topReach - 4 && p.y <= sp.yBot + 20) {
      nearSprout = sp;
    }
  }

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

      if (input.left || input.right) {
        const foot = p.y + p.h;
        const atTopPlat = Math.abs(foot - topReach) < 8;
        const atBotPlat = Math.abs(foot - nearSprout.yBot) < 8;
        if (atTopPlat || atBotPlat) {
          p.y = (atTopPlat ? topReach : nearSprout.yBot) - p.h;
          p.climbing = false;
          p.onGround = true;
          p.groundPlatIdx = atTopPlat ? nearSprout.topPlatIdx : nearSprout.botPlatIdx;
        } else {
          return;
        }
      } else {
        if (input.up && p.y + p.h <= topReach + 2) {
          p.y = L4_PLATFORMS[nearSprout.topPlatIdx].y - p.h;
          p.climbing = false; p.onGround = true; p.groundPlatIdx = nearSprout.topPlatIdx;
        }
        if (input.down && p.y + p.h >= nearSprout.yBot) {
          p.y = nearSprout.yBot - p.h;
          p.climbing = false; p.onGround = true; p.groundPlatIdx = nearSprout.botPlatIdx;
        }
        return;
      }
    }
  }

  // Horizontal
  if (input.left) { p.vx = -MOVE_SPEED; p.facing = -1; }
  else if (input.right) { p.vx = MOVE_SPEED; p.facing = 1; }
  else p.vx = 0;

  // Jump / KICK at A / WATER actions
  if (input.jump && p.onGround && p.kickTimer === 0) {
    // KICK at A
    if (p.groundPlatIdx === A_PLAT_IDX && s.rockAtAIdx >= 0) {
      const rock = s.rocks[s.rockAtAIdx];
      const cx = p.x + p.w / 2;
      if (Math.abs(cx - rock.x) < 22) {
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
    // WATER E
    else if (p.groundPlatIdx === E_BASE_PLAT_IDX && s.carrying === 'purple') {
      const cx = p.x + p.w / 2;
      if (Math.abs(cx - E_X) < 22) {
        if (s.sproutE.phase === 'seed') { s.sproutE.phase = 'growing'; s.sproutE.growProgress = 0; }
        s.sproutE.growProgress = Math.min(1, s.sproutE.growProgress + s.eGrowChunk);
        if (s.sproutE.growProgress >= 1) { s.sproutE.phase = 'alive'; }
        s.carrying = null;
        // Re-seed D
        s.sproutD.phase = 'withering';
        if (s.dragon.hits < s.diff.hitsToKill) respawnMonkeyWave(s);
      } else {
        p.vy = JUMP_FORCE; p.onGround = false; p.jumping = true; p.jumpStartPlatIdx = p.groundPlatIdx;
      }
    }
    // WATER D
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

  // Gravity & ride moving platform
  let carriedVx = 0;
  if (p.onGround && p.groundPlatIdx >= 0) {
    const pl = L4_PLATFORMS[p.groundPlatIdx];
    if (pl.moving) carriedVx = pl.moving.speed;
  }
  p.vy += GRAVITY;
  p.x += p.vx + carriedVx;
  p.y += p.vy;
  p.x = Math.max(0, Math.min(CANVAS_W - p.w, p.x));

  // Platform collisions — only same platform when jumping (keeps prior rule).
  const wasOnGround = p.onGround;
  p.onGround = false;
  const limitIdx = p.jumping ? p.jumpStartPlatIdx : -1;
  for (let i = 0; i < L4_PLATFORMS.length; i++) {
    if (limitIdx >= 0 && i !== limitIdx) continue;
    const plat = L4_PLATFORMS[i];
    if (p.x + p.w < plat.x1 || p.x > plat.x2) continue;
    const py = platY(plat, p.x + p.w / 2);
    const wasAbove = (p.y + p.h - p.vy) <= py + 1;
    if (wasAbove && p.y + p.h >= py && p.y + p.h <= py + 14 && p.vy >= 0) {
      p.y = py - p.h;
      p.vy = 0;
      p.onGround = true;
      p.groundPlatIdx = i;
      p.jumping = false;
      break;
    }
  }
  if (wasOnGround && !p.onGround && !p.jumping) {
    // free-fall
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

  // Rock vs Dragon (falling rocks only)
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
        if (!s.purpleCan) spawnCan(s, 'purple');
      }
    }
  }

  // Rocks vs player
  if (s.invuln <= 0) {
    for (const r of s.rocks) {
      if (r.state === 'restingAtA' || r.state === 'dead') continue;
      const dx = (p.x + p.w / 2) - r.x;
      const dy = (p.y + p.h / 2) - r.y;
      if (dx * dx + dy * dy < (r.r + 8) * (r.r + 8)) {
        loseLife(s); break;
      }
    }
  }

  // Dragon touch
  if (s.invuln <= 0 && d.state === 'roam') {
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

  // Win check
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
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 24; i++) {
    const sx = (i * 71) % CANVAS_W;
    const sy = (i * 53) % 100;
    ctx.fillRect(sx, sy, 1, 1);
  }

  // Platforms (sloped polygons)
  for (let i = 0; i < L4_PLATFORMS.length; i++) {
    const plat = L4_PLATFORMS[i];
    const y1 = platY(plat, plat.x1);
    const y2 = platY(plat, plat.x2);
    // dirt underside
    ctx.fillStyle = '#6B4226';
    ctx.beginPath();
    ctx.moveTo(plat.x1, y1 + 2);
    ctx.lineTo(plat.x2, y2 + 2);
    ctx.lineTo(plat.x2, y2 + 8);
    ctx.lineTo(plat.x1, y1 + 8);
    ctx.closePath();
    ctx.fill();
    // green top
    ctx.fillStyle = plat.moving ? '#5CD068' : '#3CB043';
    ctx.beginPath();
    ctx.moveTo(plat.x1, y1);
    ctx.lineTo(plat.x2, y2);
    ctx.lineTo(plat.x2, y2 + 3);
    ctx.lineTo(plat.x1, y1 + 3);
    ctx.closePath();
    ctx.fill();
  }

  // Volcano
  drawVolcano(ctx, VOLCANO_X, L4_PLATFORMS[0].y);

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
  drawSprout(ctx, s.sproutH1);
  drawSprout(ctx, s.sproutH2);
  drawSprout(ctx, s.sproutH3);

  // Cans
  if (s.greenCan) drawCan(ctx, sprites, s.greenCan);
  if (s.purpleCan) drawCan(ctx, sprites, s.purpleCan);

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

function drawRamp(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  // Decorative diagonal slab between two band edges.
  ctx.save();
  ctx.strokeStyle = '#3CB043';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = '#6B4226';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x1, y1 + 4);
  ctx.lineTo(x2, y2 + 4);
  ctx.stroke();
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
