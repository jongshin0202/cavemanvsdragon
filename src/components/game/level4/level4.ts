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
import { playWingFlapSound, playJumpSound, playRobotKillSound, playHitSound, playBarrelRollSound, playFireBreathSound, playDragonRoarSound, playWaterSproutSound, playVineGrowSound } from '../sounds';

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
  /** Per-frame x-delta applied this tick (used by riders to move with the platform). */
  dx?: number;
}
export interface L4Platform {
  y: number;
  x1: number;
  x2: number;
  slope?: number;
  moving?: L4Mover;
  /** Blue ICE ramp — everything slides downhill; jump still works for player. */
  ice?: boolean;
}

function platY(p: L4Platform, x: number): number {
  const cx = Math.max(p.x1, Math.min(p.x2, x));
  return p.y + (cx - p.x1) * (p.slope || 0);
}

// 7 bands. P1=445 P2=370 P3=295 P4=220 P5=145 P5.5=107 P6=70 (equal 75 except P5↔P5.5 = 37).
export const L4_PLATFORMS: L4Platform[] = [
  // ── P6 (y=70) top: princess + volcano. ENDS at 410 leaving gap to ice top at 430. ──
  /*  0 P6_MAIN          */ { y: 70,  x1: 60,  x2: 410 },

  // ICE_TR: less steep — top at (512,70), bottom at (297,145) aligning to P4_TENT_TOP right edge.
  /*  1 ICE_TR           */ { y: 145, x1: 297, x2: 512, slope: (70 - 145) / (512 - 297), ice: true },

  // ── P5.5 (y=107.5) small left stub — extends to far-left edge of screen ──
  /*  2 P55_LEFT         */ { y: 107.5, x1: 0,   x2: 126 },

  // ICE ramp from P5.5 right edge (126,107.5) down to P5 left (155,145)
  /*  3 ICE_55           */ { y: 107.5, x1: 126, x2: 155, slope: (145 - 107.5) / (155 - 126), ice: true },

  // ── P5 (y=145) E flat (purple sprout). Right edge aligns to P4_TENT_TOP left (215). ──
  /*  4 P5_E_FLAT        */ { y: 145, x1: 155, x2: 215 },

  // ── P4 (y=220) ── D-flat (HOLE >70) | mover_L | tent_top | mover_R | right
  /*  5 P4_LEFT_D        */ { y: 220, x1: 0,   x2: 70  },
  /*  6 P4_MOVER_L       */ { y: 220, x1: 145, x2: 185 },
  /*  7 P4_TENT_TOP      */ { y: 220, x1: 215, x2: 297 },
  /*  8 P4_MOVER_R       */ { y: 220, x1: 312, x2: 352 },
  /*  9 P4_RIGHT         */ { y: 220, x1: 380, x2: 512 },

  // ICE_NEW: top connects to P4_TENT_TOP left edge (215,220); bottom (130,295).
  /* 10 ICE_NEW          */ { y: 295, x1: 130, x2: 215, slope: (220 - 295) / (215 - 130), ice: true },

  // ICE_TENT_R: steeper, same slope as ICE_NEW — top at (297,220), bottom at (382,295).
  /* 11 ICE_TENT_R       */ { y: 220, x1: 297, x2: 382, slope: (295 - 220) / (382 - 297), ice: true },


  // ── P3 (y=295) ── left (HOLE >70) | mover | right (gap on left: starts at 450 → hole 415..450)
  /* 12 P3_LEFT          */ { y: 295, x1: 0,   x2: 70  },
  /* 13 P3_MOVER         */ { y: 295, x1: 230, x2: 290 },
  /* 14 P3_RIGHT         */ { y: 295, x1: 450, x2: 512 },

  // ── P2 (y=370) ── left (H2) | mover_A | mover_B | farright
  /* 15 P2_LEFT          */ { y: 370, x1: 0,   x2: 130 },
  /* 16 P2_MOVER_A       */ { y: 370, x1: 160, x2: 215 },
  /* 17 P2_MOVER_B       */ { y: 370, x1: 250, x2: 305 },
  /* 18 P2_FARRIGHT      */ { y: 370, x1: 420, x2: 512 },




  // ── P1 (y=445) ── left | mover | right (H1 ladder right)
  /* 19 P1_LEFT          */ { y: 445, x1: 0,   x2: 175 },
  /* 20 P1_MOVER         */ { y: 445, x1: 220, x2: 280 },
  /* 21 P1_RIGHT         */ { y: 445, x1: 370, x2: 512 },
];

function rsp(lo: number, hi: number): number {
  return (Math.random() < 0.5 ? -1 : 1) * (lo + Math.random() * (hi - lo));
}
function rmag(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

// 6 movers: P4 flanking tent (6,8), P3 center (13), P2 pair (16,17), P1 center (22).
L4_PLATFORMS[6].moving  = { min: 70, max: 175, speed: rsp(0.5, 1.0) }; // touches P4_LEFT_D (x2=70) on the left, bounces before tent (x=215, w=40) on the right
L4_PLATFORMS[8].moving  = { min: 300, max: 340, speed: rsp(0.5, 1.0) }; // bounces before P4_RIGHT (x=380, w=40)
L4_PLATFORMS[13].moving = { min: 70, max: 390, speed: rsp(0.6, 1.2) }; // touches P3_LEFT (x2=70) and P3_RIGHT (x1=450, w=60)
L4_PLATFORMS[16].moving = { min: 132, max: 230, speed:  rmag(0.6, 1.2), pairIdx: 17 };
L4_PLATFORMS[17].moving = { min: 240, max: 348, speed: -rmag(0.6, 1.2), pairIdx: 16 };
L4_PLATFORMS[20].moving = { min: 188, max: 310, speed: rsp(0.5, 1.0) }; // bounces before P1_RIGHT (x=370, w=60)

// Named anchors
const PRINCESS_X = 220;
const PRINCESS_Y = L4_PLATFORMS[0].y - 48;
const VOLCANO_X  = 340;
const C_X = 270;   // rock decision point on P6 (above E)
const E_X = 185;   // E (purple) — middle of P5_E_FLAT (155..215)
const A_X = 185;   // rock-rest A on P5_E_FLAT (under C)
const D_X = 30;    // D (green) on P4_LEFT_D

const PRINCESS_PLAT_IDX = 0;
const E_BASE_PLAT_IDX   = 4;   // P5_E_FLAT
const E_TOP_PLAT_IDX    = 0;   // P6_FULL
const D_BASE_PLAT_IDX   = 5;   // P4_LEFT_D
const D_TOP_PLAT_IDX    = 2;   // P55_LEFT
const A_PLAT_IDX        = 4;   // P5_E_FLAT

// H ladder sprouts
const H1_X = 480, H1_TOP_IDX = 18, H1_BOT_IDX = 21;  // P2_FARRIGHT → P1_RIGHT
const H2_X = 30,  H2_TOP_IDX = 12, H2_BOT_IDX = 15;  // P3_LEFT     → P2_LEFT
const H3_X = 480, H3_TOP_IDX = 9,  H3_BOT_IDX = 14;  // P4_RIGHT    → P3_RIGHT
const H4_X = 30,  H4_TOP_IDX = 5,  H4_BOT_IDX = 12;  // P4_LEFT_D   → P3_LEFT
const H5_X = 30,  H5_TOP_IDX = 15, H5_BOT_IDX = 19;  // P2_LEFT     → P1_LEFT
const H6_X = 480, H6_TOP_IDX = 14, H6_BOT_IDX = 18;  // P3_RIGHT    → P2_FARRIGHT
const H7_X = 30,  H7_TOP_IDX = 2,  H7_BOT_IDX = 5;   // P55_LEFT    → P4_LEFT_D

const MONKEY_PLAT_ANCHORS: number[] = [
  5, 9, 12, 13, 14, 15, 18, 19, 20, 21,
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
  kicked?: boolean;
  rollPhase?: number;
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
  dyingVy?: number;
  dyingSpin?: number;
  hits: number;
  frame: number; frameTimer: number;
  fireTimer: number;     // frames remaining of active fire
  fireCooldown: number;  // frames until can breathe fire again (only ticks on ground)
}

// Fire breath constants
const FIRE_DURATION = 30;   // 0.5s @ 60fps
const FIRE_COOLDOWN = 180;  // 3s @ 60fps
const FIRE_LEN = CANVAS_W * 0.25;
const FIRE_H = 28;

interface Monkey {
  alive: boolean;
  x: number; y: number;
  platIdx: number;
  vx: number;
  facing: number;
  walkFrame: number; walkTimer: number;
  transferCooldown?: number;
  transferMisses?: number;
}

interface MonkeyFireball { x: number; y: number; vx: number; vy: number; r: number; age: number }
interface VolcanoFireball {
  startX: number; startY: number;
  endX: number; endY: number;
  apexX: number; apexY: number;
  t: number; duration: number;
  x: number; y: number;
  radius: number;
  landed: boolean;
}

interface Can {
  x: number; y: number; color: 'green' | 'purple'; picked: boolean;
  /** Flying = in-arc from dragon mouth; false once it lands on a platform. */
  flying?: boolean;
  vx?: number; vy?: number;
  /** Visual spin angle in radians while flying. */
  spin?: number;
  /** Platform it landed on (for moving-platform tracking). -1 if static. */
  riderPlatIdx?: number;
  /** Offset from platform.x1 used to ride movers. */
  riderOffset?: number;
}

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
  monkeyFireballs: MonkeyFireball[];
  monkeyFireballTimer: number;
  volcanoFireballs: VolcanoFireball[];
  volcanoFireballTimer: number;
  sproutD: Sprout;
  sproutE: Sprout;
  sproutH1: Sprout;
  sproutH2: Sprout;
  sproutH3: Sprout;
  sproutH4: Sprout;
  sproutH5: Sprout;
  sproutH6: Sprout;
  sproutH7: Sprout;
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
  helpTimer: number;
  showHelp: boolean;
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

function buildMonkeyDistribution(iter: number, excludeSpawn: boolean = false): number[] {
  // L1-style: round-robin onto platform with current min count, cap per-plat=5, total cap=20.
  const counts = new Array<number>(MONKEY_PLAT_ANCHORS.length).fill(0);
  // Caveman spawn platform (P1_LEFT = idx 19) — never seed monkeys here at level start.
  const blocked = new Set<number>();
  if (excludeSpawn) {
    const i19 = MONKEY_PLAT_ANCHORS.indexOf(19);
    if (i19 >= 0) blocked.add(i19);
  }
  const total = Math.min(MONKEY_TOTAL_CAP, LEVEL4_PARAMS.MONKEYS_BASE + Math.max(0, iter - 1));
  for (let i = 0; i < total; i++) {
    let min = Infinity;
    for (let j = 0; j < counts.length; j++) {
      if (blocked.has(j)) continue;
      if (counts[j] < MONKEY_PER_PLAT_CAP && counts[j] < min) min = counts[j];
    }
    const cand: number[] = [];
    for (let j = 0; j < counts.length; j++) {
      if (blocked.has(j)) continue;
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
  randomizeMover(6,  rsp(0.5, 1.0));
  randomizeMover(8,  rsp(0.5, 1.0));
  randomizeMover(13, rsp(0.6, 1.2));
  // P2 pair: opposite directions, different magnitudes.
  randomizeMover(16,  rmag(0.6, 1.2));
  randomizeMover(17, -rmag(0.6, 1.2));
  randomizeMover(20, rsp(0.5, 1.0));

  // Caveman on P1_LEFT (idx 19).
  const player: Player = {
    x: 20, y: platY(L4_PLATFORMS[19], 20) - 24, w: 16, h: 24,
    vx: 0, vy: 0, onGround: true, groundPlatIdx: 19, jumpStartPlatIdx: 19,
    climbing: false, facing: 1, jumping: false,
    walkFrame: 0, walkTimer: 0, jumpFrame: 0, jumpTimer: 0,
    climbFrame: 0, climbTimer: 0, kickTimer: 0,
  };

  // Dragon spawns next to princess on P6, intro-jumps to TENT_TOP (idx 7).
  const dragon: Dragon = {
    x: 140, y: L4_PLATFORMS[0].y - DRAGON_H,
    vx: 0, vy: 0, airborne: false,
    platIdx: 0, targetPlatIdx: 7,
    facing: -1, jumpCooldown: 60,
    state: 'intro', downedTimer: 0, dyingTimer: 0, hits: 0,
    frame: 0, frameTimer: 0,
    fireTimer: 0, fireCooldown: FIRE_COOLDOWN,
  };

  // Monkeys via L1-style distribution.
  const dist = buildMonkeyDistribution(iter, true);
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
    monkeyFireballs: [],
    monkeyFireballTimer: 180,
    volcanoFireballs: [],
    volcanoFireballTimer: 180,
    sproutD: mkSprout(D_X, D_TOP_PLAT_IDX, D_BASE_PLAT_IDX, { noAutoWither: true }),
    sproutE: mkSprout(E_X, E_TOP_PLAT_IDX, E_BASE_PLAT_IDX, { purple: true, noAutoWither: true, partialGrow: true }),
    sproutH1: mkSprout(H1_X, H1_TOP_IDX, H1_BOT_IDX),
    sproutH2: mkSprout(H2_X, H2_TOP_IDX, H2_BOT_IDX),
    sproutH3: mkSprout(H3_X, H3_TOP_IDX, H3_BOT_IDX),
    sproutH4: mkSprout(H4_X, H4_TOP_IDX, H4_BOT_IDX),
    sproutH5: mkSprout(H5_X, H5_TOP_IDX, H5_BOT_IDX),
    sproutH6: mkSprout(H6_X, H6_TOP_IDX, H6_BOT_IDX),
    sproutH7: mkSprout(H7_X, H7_TOP_IDX, H7_BOT_IDX),
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
    helpTimer: 0,
    showHelp: false,
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

  // Princess "Help!" animation timer (same cadence as L1)
  s.helpTimer++;
  if (s.helpTimer > 120) {
    s.helpTimer = 0;
    s.showHelp = !s.showHelp;
    // Help text toggles but sound is muted
  }

  tickMovingPlatforms(s);
  tickRocks(s);
  tickSprouts(s);
  tickMonkeys(s);
  tickMonkeyFireballs(s);
  tickVolcanoFireballs(s);
  tickDragon(s);
  tickPlayer(s, input);
  tickCans(s);
  tickCollisions(s);

  return { died: false, won: s.won };
}

function respawnPlayer(s: L4State) {
  const p = s.player;
  p.x = 20; p.y = platY(L4_PLATFORMS[19], 20) - 24;
  p.vx = 0; p.vy = 0;
  p.onGround = true; p.climbing = false; p.jumping = false;
  p.groundPlatIdx = 19; p.jumpStartPlatIdx = 19;
  p.facing = 1; p.kickTimer = 0;
}

// ── Moving platforms ────────────────────────────────────────
function tickMovingPlatforms(s: L4State) {
  // First pass: tentative move + bounce off own min/max.
  for (let i = 0; i < L4_PLATFORMS.length; i++) {
    const pl = L4_PLATFORMS[i];
    if (!pl.moving) continue;
    const w = pl.x2 - pl.x1;
    const prevX1 = pl.x1;
    let nx = pl.x1 + pl.moving.speed;
    if (nx < pl.moving.min) { nx = pl.moving.min; pl.moving.speed = Math.abs(pl.moving.speed); }
    if (nx + w > pl.moving.max + w) { /* unreachable: max stored as left edge max */ }
    // Use max as the maximum LEFT edge (so platform stays within [min, max]).
    if (nx > pl.moving.max) { nx = pl.moving.max; pl.moving.speed = -Math.abs(pl.moving.speed); }
    pl.x1 = nx;
    pl.x2 = nx + w;
    pl.moving.dx = pl.x1 - prevX1;
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
      // Reflect the separation in dx so riders move with their platform.
      pl.moving.dx = (pl.moving.dx ?? 0) - overlap / 2;
      other.moving.dx = (other.moving.dx ?? 0) + overlap / 2;
    }
  }
}

// ── Rocks ───────────────────────────────────────────────────
function tickRocks(s: L4State) {
  s.spawnRockTimer--;
  let rollingCount = 0;
  for (const r of s.rocks) {
    if (r.state === 'dead') continue;
    rollingCount++;
  }
  const maxRolling = Math.max(1, s.iter);
  if (s.spawnRockTimer <= 0 && rollingCount < maxRolling) {
    const round = 1 + (s.iter - 1) * 4;
    const d = getRoundDifficulty(round);
    s.spawnRockTimer = Math.round(d.barrelSpawnMin + Math.random() * d.barrelSpawnRange);
    const dir = Math.random() < 0.5 ? -1 : 1;
    const top0 = L4_PLATFORMS[0];
    s.rocks.push({
      x: VOLCANO_X, y: top0.y - 8,
      vx: 1.4 * dir, vy: 0, r: 8,
      state: 'rollingTop', platIdx: 0, age: 0,
    });
    playBarrelRollSound();
  } else if (s.spawnRockTimer <= 0) {
    s.spawnRockTimer = 15;
  }




  for (let i = 0; i < s.rocks.length; i++) {
    const r = s.rocks[i];
    r.age++;
    r.rollPhase = (r.rollPhase ?? 0) + Math.abs(r.vx) + (r.state === 'falling' ? Math.abs(r.vy) * 0.5 : 0);
    switch (r.state) {
      case 'flying': {
        r.vy += 0.18;
        r.x += r.vx;
        r.y += r.vy;
        const top = L4_PLATFORMS[0];
        if (r.vy > 0 && r.y + r.r >= top.y && r.x >= top.x1 && r.x <= top.x2) {
          r.y = top.y - r.r;
          r.vy = 0;
          // Continue in the direction it was thrown — left or right.
          r.vx = (r.vx >= 0 ? 1.4 : -1.4);
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
        // Screen-edge bounce while rolling on the top platform.
        if (r.x - r.r < 0) { r.x = r.r; r.vx = Math.abs(r.vx) || 1.4; }
        else if (r.x + r.r > CANVAS_W) { r.x = CANVAS_W - r.r; r.vx = -(Math.abs(r.vx) || 1.4); }
        // Off either platform edge (inside the screen) → cascade down platforms.
        if (r.x > top.x2 + 2) {
          r.state = 'rollingDown';
          r.vx = 1.0; r.vy = 0;
          r.platIdx = -1;
          break;
        }
        if (r.x < top.x1 - 2) {
          r.state = 'rollingDown';
          r.vx = -1.0; r.vy = 0;
          r.platIdx = -1;
          break;
        }
        break;
      }
      case 'falling': {
        r.vy += GRAVITY;
        r.y += r.vy;
        const ev = L4_PLATFORMS[E_BASE_PLAT_IDX];
        if (r.x >= ev.x1 && r.x <= ev.x2 && r.y + r.r >= ev.y) {
          r.y = ev.y - r.r;
          r.vy = 0;
          r.state = 'rollingDown';
          r.vx = 1.4;
          r.platIdx = E_BASE_PLAT_IDX;
          break;
        }
        if (r.y > CANVAS_H + 20) r.state = 'dead';
        break;
      }
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
            const prevPlat = r.platIdx;
            r.platIdx = pi;
            if (r.vx === 0) r.vx = Math.random() < 0.5 ? -1 : 1;
            // On P5.5 left stub, always roll right toward the ice ramp.
            if (pi === 2) r.vx = Math.abs(r.vx) || 1;
            // On ice ramps, force the rock to roll DOWN the slope.
            if (pl.ice && pl.slope) {
              const downSign = pl.slope > 0 ? 1 : -1; // downhill direction (higher y)
              r.vx = downSign * Math.max(1.2, Math.abs(r.vx));
            }
            // On any P3 platform (long mid row), 50/50 randomize direction on landing.
            if ((pi === 12 || pi === 13 || pi === 14) && prevPlat !== pi) {
              const sp = Math.max(1.4, Math.abs(r.vx) || 1.4);
              r.vx = (Math.random() < 0.5 ? -1 : 1) * sp;
            }
            break;
          }
        }
        // Screen-edge bounce: if rock is sitting on any platform and reaches
        // the canvas left/right side, reverse direction instead of rolling off.
        if (r.vy === 0 && r.platIdx >= 0) {
          if (r.x - r.r < 0) { r.x = r.r; r.vx = Math.abs(r.vx) || 1.4; }
          else if (r.x + r.r > CANVAS_W) { r.x = CANVAS_W - r.r; r.vx = -(Math.abs(r.vx) || 1.4); }
        }
        if (r.y > CANVAS_H + 30 || r.x < -30 || r.x > CANVAS_W + 30) r.state = 'dead';
        break;
      }
      case 'dead':
        break;
    }
  }
  if (s.rocks.some(r => r.state === 'dead')) {
    s.rocks = s.rocks.filter(r => r.state !== 'dead');
    s.rockAtAIdx = -1;
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

  // H1..H6 auto-regrow.
  const autoRegrow = (sp: Sprout) => {
    if (sp.phase === 'seed' && sp.regrowTimer <= 0 && sp.growProgress === 0) {
      sp.phase = 'growing';
    }
  };
  autoRegrow(s.sproutH1);
  autoRegrow(s.sproutH2);
  autoRegrow(s.sproutH3);
  autoRegrow(s.sproutH4);
  autoRegrow(s.sproutH5);
  autoRegrow(s.sproutH6);
  // H7 does NOT auto-regrow — shares column with D (green-can sprout).
  tickOneSprout(s.sproutH1);
  tickOneSprout(s.sproutH2);
  tickOneSprout(s.sproutH3);
  tickOneSprout(s.sproutH4);
  tickOneSprout(s.sproutH5);
  tickOneSprout(s.sproutH6);
  tickOneSprout(s.sproutH7);
}

// ── Monkeys ─────────────────────────────────────────────────
// Neighboring same-row platforms (includes movers). Monkeys can step across
// when the gap closes (so they roam between static + moving platforms).
const MONKEY_ROW_NEIGHBORS: number[][] = [
  [5, 6, 7, 8, 9],     // P4 row
  [12, 13, 14],        // P3 row
  [15, 16, 17, 18],    // P2 row
  [19, 20, 21],        // P1 row
];
function getMonkeyRowNeighbors(platIdx: number): number[] {
  for (const row of MONKEY_ROW_NEIGHBORS) if (row.includes(platIdx)) return row.filter(i => i !== platIdx);
  return [];
}

function getMonkeyAdjacentPlatforms(platIdx: number): number[] {
  for (const row of MONKEY_ROW_NEIGHBORS) {
    const idx = row.indexOf(platIdx);
    if (idx >= 0) return [row[idx - 1], row[idx + 1]].filter((i): i is number => i !== undefined);
  }
  return [];
}

const MONKEY_MIN_SPEED = 0.55;
const MONKEY_TRANSFER_GAP = 12;
const MONKEY_EDGE_HOLD_GAP = 22;
const MONKEY_APPROACH_WAIT_FRAMES = 45;
const MONKEY_LEFT_OVERHANG = 6;
const MONKEY_RIGHT_OVERHANG = 8;
const MONKEY_TRANSFER_CHANCE = 1 / 3;
const MONKEY_TRANSFER_COOLDOWN = 18;

function monkeyLeftLimit(pl: L4Platform): number { return pl.x1 - MONKEY_LEFT_OVERHANG; }
function monkeyRightLimit(pl: L4Platform): number { return pl.x2 - MONKEY_RIGHT_OVERHANG; }

function shouldAimForTransfer(gap: number, closingSpeed: number, distToEdge: number, walkSpeed: number): boolean {
  if (gap <= MONKEY_TRANSFER_GAP) return true;
  if (closingSpeed <= 0) return false;
  const framesToTouch = gap / closingSpeed;
  const framesToEdge = Math.max(0, distToEdge) / Math.max(0.1, walkSpeed);
  return framesToTouch <= framesToEdge + MONKEY_APPROACH_WAIT_FRAMES;
}

function getMonkeyTransferIntent(m: Monkey, plat: L4Platform): { dir: -1 | 1; hold: boolean } | null {
  const walkSpeed = Math.max(MONKEY_MIN_SPEED, Math.abs(m.vx) || MONKEY_MIN_SPEED);
  const platSpeed = plat.moving?.speed ?? 0;
  for (const ni of getMonkeyAdjacentPlatforms(m.platIdx)) {
    const np = L4_PLATFORMS[ni];
    if (np.y !== plat.y) continue;
    const neighborSpeed = np.moving?.speed ?? 0;
    const gapRight = np.x1 - plat.x2;
    if (gapRight >= -MONKEY_TRANSFER_GAP) {
      const closing = platSpeed - neighborSpeed;
      const dist = monkeyRightLimit(plat) - m.x;
      if (shouldAimForTransfer(Math.max(0, gapRight), closing, dist, walkSpeed)) {
        const framesToTouch = closing > 0 ? Math.max(0, gapRight) / closing : 0;
        return { dir: 1, hold: gapRight <= MONKEY_EDGE_HOLD_GAP || framesToTouch <= MONKEY_APPROACH_WAIT_FRAMES };
      }
    }
    const gapLeft = plat.x1 - np.x2;
    if (gapLeft >= -MONKEY_TRANSFER_GAP) {
      const closing = neighborSpeed - platSpeed;
      const dist = m.x - monkeyLeftLimit(plat);
      if (shouldAimForTransfer(Math.max(0, gapLeft), closing, dist, walkSpeed)) {
        const framesToTouch = closing > 0 ? Math.max(0, gapLeft) / closing : 0;
        return { dir: -1, hold: gapLeft <= MONKEY_EDGE_HOLD_GAP || framesToTouch <= MONKEY_APPROACH_WAIT_FRAMES };
      }
    }
  }
  return null;
}

function tickMonkeys(s: L4State) {
  for (const m of s.monkeys) {
    if (!m.alive) continue;
    let plat = L4_PLATFORMS[m.platIdx];
    if ((m.transferCooldown ?? 0) > 0) m.transferCooldown = (m.transferCooldown ?? 0) - 1;
    // Ride moving platforms smoothly — inherit the platform's per-frame dx.
    if (plat.moving && plat.moving.dx) m.x += plat.moving.dx;

    const speed = Math.max(MONKEY_MIN_SPEED, Math.abs(m.vx) || MONKEY_MIN_SPEED);
    const intent = (m.transferCooldown ?? 0) <= 0 ? getMonkeyTransferIntent(m, plat) : null;
    if (intent) m.vx = intent.dir * speed;

    m.x += m.vx;
    // Keep m.x continuous (world coords) — do NOT snap it.
    const hasTransferContact = (dir: -1 | 1) => getMonkeyAdjacentPlatforms(m.platIdx).some((ni) => {
      const np = L4_PLATFORMS[ni];
      if (np.y !== plat.y) return false;
      return dir > 0
        ? Math.abs(np.x1 - plat.x2) <= MONKEY_TRANSFER_GAP
        : Math.abs(plat.x1 - np.x2) <= MONKEY_TRANSFER_GAP;
    });
    const tryTransfer = (dir: -1 | 1) => {
      if ((m.transferCooldown ?? 0) > 0) return false;
      for (const ni of getMonkeyAdjacentPlatforms(m.platIdx)) {
        const np = L4_PLATFORMS[ni];
        if (np.y !== plat.y) continue;
        if (dir > 0 && Math.abs(np.x1 - plat.x2) <= MONKEY_TRANSFER_GAP && m.x >= monkeyRightLimit(plat) - 3) {
          if ((m.transferMisses ?? 0) >= 2 || Math.random() < MONKEY_TRANSFER_CHANCE) {
            m.platIdx = ni; plat = np; m.x = monkeyLeftLimit(np) + 2; m.transferMisses = 0; m.transferCooldown = MONKEY_TRANSFER_COOLDOWN; return true;
          }
          m.transferMisses = (m.transferMisses ?? 0) + 1; m.transferCooldown = MONKEY_TRANSFER_COOLDOWN; return false;
        }
        if (dir < 0 && Math.abs(plat.x1 - np.x2) <= MONKEY_TRANSFER_GAP && m.x <= monkeyLeftLimit(plat) + 3) {
          if ((m.transferMisses ?? 0) >= 2 || Math.random() < MONKEY_TRANSFER_CHANCE) {
            m.platIdx = ni; plat = np; m.x = monkeyRightLimit(np) - 2; m.transferMisses = 0; m.transferCooldown = MONKEY_TRANSFER_COOLDOWN; return true;
          }
          m.transferMisses = (m.transferMisses ?? 0) + 1; m.transferCooldown = MONKEY_TRANSFER_COOLDOWN; return false;
        }
      }
      return false;
    };
    const WRAP_PAIRS: Record<number, number> = { 5: 9, 9: 5, 12: 14, 14: 12, 15: 18, 18: 15, 19: 21, 21: 19 };
    const wrapPartner = (s.iter >= 3) ? WRAP_PAIRS[m.platIdx] : undefined;
    if (m.vx > 0 && m.x > CANVAS_W - 18 && wrapPartner !== undefined) {
      const np = L4_PLATFORMS[wrapPartner];
      m.platIdx = wrapPartner; plat = np; m.x = np.x1 + 4;
    } else if (m.vx < 0 && m.x < 4 && wrapPartner !== undefined) {
      const np = L4_PLATFORMS[wrapPartner];
      m.platIdx = wrapPartner; plat = np; m.x = np.x2 - 18;
    } else if (m.x > monkeyRightLimit(plat)) {
      if (!tryTransfer(1)) {
        m.x = monkeyRightLimit(plat);
        if (hasTransferContact(1) || !(intent?.dir === 1 && intent.hold)) m.vx = -speed;
      }
    } else if (m.x < monkeyLeftLimit(plat)) {
      if (!tryTransfer(-1)) {
        m.x = monkeyLeftLimit(plat);
        if (hasTransferContact(-1) || !(intent?.dir === -1 && intent.hold)) m.vx = speed;
      }
    }
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

// ── Monkey fireballs ────────────────────────────────────────
// From L4 iter 2+, monkeys throw fireballs at the caveman.
// Scaling follows L2 fireball ramp (steps = L4iter - 2):
//   - max simultaneous = 1 + floor(steps/3)
//   - interval (sec)   = 5.95 * 0.9^steps  (jittered 0.5..1.5x)
//   - speed (px/frame) = baseline 2.2 * 1.1^steps
function tickMonkeyFireballs(s: L4State) {
  // Move existing
  for (const fb of s.monkeyFireballs) {
    fb.x += fb.vx;
    fb.y += fb.vy;
    fb.age++;
  }
  s.monkeyFireballs = s.monkeyFireballs.filter(
    fb => fb.age < 600 && fb.x > -30 && fb.x < CANVAS_W + 30 && fb.y > -30 && fb.y < CANVAS_H + 30,
  );
  // Horizontal-only fireballs for L4 iter 1-3; aimed anywhere from iter 4+.
  if (s.iter < 1) return;
  const steps = Math.max(0, s.iter - 2);
  const maxFireballs = 1 + Math.floor(steps / 3);
  if (s.monkeyFireballs.length >= maxFireballs) return;
  if (s.monkeyFireballTimer > 0) { s.monkeyFireballTimer--; return; }
  const alive = s.monkeys.filter(m => m.alive);
  if (!alive.length) { s.monkeyFireballTimer = 60; return; }
  const m = alive[Math.floor(Math.random() * alive.length)];
  const p = s.player;
  const sx = m.x + 7;
  const sy = m.y + 4;
  const speed = 2.2 * Math.pow(1.1, steps);
  let vx: number, vy: number;
  if (s.iter <= 3) {
    // Horizontal only: face the player and shoot straight
    const dir = p.x + p.w / 2 < sx ? -1 : 1;
    vx = dir * speed;
    vy = 0;
  } else {
    // Aimed at player
    const tx = p.x + p.w / 2;
    const ty = p.y + p.h / 2;
    const dx = tx - sx, dy = ty - sy;
    const L = Math.hypot(dx, dy) || 1;
    vx = (dx / L) * speed;
    vy = (dy / L) * speed;
  }
  s.monkeyFireballs.push({ x: sx, y: sy, vx, vy, r: 5, age: 0 });
  const intervalSec = 5.95 * Math.pow(0.9, steps);
  s.monkeyFireballTimer = Math.round(intervalSec * 60 * (0.5 + Math.random()));
}

// ── Volcano fireballs (volcano rocks) ───────────────────────
// From L4 iter 2+, the volcano launches arcing fire rocks aimed at the
// caveman. Scaling follows L2 fireball ramp (steps = L4iter - 2):
//   - max simultaneous = 1 + floor(steps/3)
//   - interval (sec)   = 5.95 * 0.9^steps  (jittered 0.5..1.5x)
//   - flight (sec)     = 12.8 * 0.9^steps  (faster = shorter flight)
// Volcano mouth sits near (VOLCANO_X, P6.y - 48).
function tickVolcanoFireballs(s: L4State) {
  // Advance existing arcs.
  for (const fb of s.volcanoFireballs) {
    if (fb.landed) continue;
    fb.t = Math.min(1, fb.t + 1 / Math.max(1, fb.duration));
    const t = fb.t, omt = 1 - t;
    fb.x = omt * omt * fb.startX + 2 * omt * t * fb.apexX + t * t * fb.endX;
    fb.y = omt * omt * fb.startY + 2 * omt * t * fb.apexY + t * t * fb.endY;
    fb.radius = 4 + 6 * t;
    if (fb.t >= 1 || fb.y > CANVAS_H + 12 || fb.x < -20 || fb.x > CANVAS_W + 20) {
      fb.landed = true;
    }
  }
  s.volcanoFireballs = s.volcanoFireballs.filter(fb => !fb.landed);
  if (s.iter < 2) return;
  const steps = s.iter - 2;
  const maxFB = 1 + Math.floor(steps / 3);
  if (s.volcanoFireballs.length >= maxFB) return;
  if (s.volcanoFireballTimer > 0) { s.volcanoFireballTimer--; return; }
  const mouthX = VOLCANO_X;
  const mouthY = L4_PLATFORMS[0].y - 48;
  const p = s.player;
  const targetX = Math.max(8, Math.min(CANVAS_W - 8, p.x + p.w / 2 + (Math.random() - 0.5) * 40));
  const targetY = p.y + p.h / 2;
  const apexX = mouthX + (targetX - mouthX) * (0.4 + Math.random() * 0.2);
  const apexY = Math.min(mouthY, targetY) - (60 + Math.random() * 30);
  const flightSec = 12.8 * Math.pow(0.9, steps);
  s.volcanoFireballs.push({
    startX: mouthX, startY: mouthY,
    endX: targetX, endY: targetY,
    apexX, apexY,
    t: 0, duration: Math.round(flightSec * 60),
    x: mouthX, y: mouthY, radius: 4, landed: false,
  });
  const intervalSec = 5.95 * Math.pow(0.9, steps);
  s.volcanoFireballTimer = Math.round(intervalSec * 60 * (0.5 + Math.random()));
}


function spawnCan(s: L4State, color: 'green' | 'purple') {
  const candidates = MONKEY_PLAT_ANCHORS;
  const pi = candidates[Math.floor(Math.random() * candidates.length)];
  const pl = L4_PLATFORMS[pi];
  const x = pl.x1 + 14 + Math.random() * Math.max(8, pl.x2 - pl.x1 - 32);
  const can: Can = { x, y: platY(pl, x) - 14, color, picked: false };
  if (color === 'green') s.greenCan = can; else s.purpleCan = can;
}

/** Dragon spits a can: it arcs from the dragon's mouth and lands on a
 *  random P1–P4 platform (static OR moving). After landing it tracks
 *  the platform if it's a mover. */
function spawnCanFromDragon(s: L4State, color: 'green' | 'purple') {
  const d = s.dragon;
  const originX = d.x + (d.facing >= 0 ? DRAGON_W - 6 : 6);
  const originY = d.y + 18;
  // Candidate platforms: every P1–P4 platform (static + movers).
  const targetIdxs = [5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
  const ti = targetIdxs[Math.floor(Math.random() * targetIdxs.length)];
  const pl = L4_PLATFORMS[ti];
  const tx = pl.x1 + 14 + Math.random() * Math.max(8, pl.x2 - pl.x1 - 32);
  const ty = platY(pl, tx) - 14;
  // Solve ballistic arc: pick a flight time, derive vx/vy from gravity.
  const flightFrames = 90;
  const vx = (tx - originX) / flightFrames;
  const vy = (ty - originY - 0.5 * GRAVITY * flightFrames * flightFrames) / flightFrames;
  const can: Can = {
    x: originX, y: originY, color, picked: false,
    flying: true, vx, vy, spin: 0,
    riderPlatIdx: ti,
    riderOffset: tx - pl.x1,
  };
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
function getFireRect(d: Dragon) {
  // Fire reaches down to the platform top so it hits the (shorter) caveman.
  const yBot = d.y + DRAGON_H - 2;
  const x = d.facing >= 0 ? d.x + DRAGON_W - 4 : d.x + 4 - FIRE_LEN;
  return { x, y: yBot - FIRE_H, w: FIRE_LEN, h: FIRE_H };
}

function tickDragon(s: L4State) {
  const d = s.dragon;
  d.frameTimer++;
  if (d.frameTimer >= 8) { d.frameTimer = 0; d.frame = (d.frame + 1) % DRAGON_FRAMES; }

  // Wing-flap audio cadence — flap flap flap while airborne (every ~14 frames ≈ 0.23s).
  const dd = d as Dragon & { flapAudio?: number };
  if ((d.state === 'intro' || (d.state === 'roam' && d.airborne))) {
    dd.flapAudio = (dd.flapAudio ?? 0) + 1;
    if (dd.flapAudio >= 36) {
      dd.flapAudio = 0;
      playWingFlapSound();
    }
  } else {
    dd.flapAudio = 0;
  }


  if (d.state === 'dead') return;
  if (d.state === 'dying') {
    d.dyingVy = (d.dyingVy ?? 0) + 0.45;
    d.y += d.dyingVy;
    d.dyingSpin = (d.dyingSpin ?? 0) + 0.35;
    d.dyingTimer--;
    if (d.y > CANVAS_H + 40) d.state = 'dead';
    return;
  }
  if (d.state === 'downed') {
    // Glide to the right steady platform (P4_RIGHT = idx 9) while dizzy,
    // then sit there for the remaining timer before waking up.
    const tgt = 9;
    const tp = L4_PLATFORMS[tgt];
    const tcx = (tp.x1 + tp.x2) / 2;
    const tgtY = tp.y - DRAGON_H;
    const tgtX = tcx - DRAGON_W / 2;
    const dx = tgtX - d.x;
    const dy = tgtY - d.y;
    const dist = Math.hypot(dx, dy);
    const glide = 2.4;
    if (dist > glide) {
      d.x += (dx / dist) * glide;
      d.y += (dy / dist) * glide;
      d.facing = dx >= 0 ? 1 : (dx < 0 ? -1 : d.facing);
      d.airborne = true;
    } else {
      d.x = tgtX;
      d.y = tgtY;
      d.vx = 0; d.vy = 0;
      d.airborne = false;
      d.platIdx = tgt;
      d.downedTimer--;
      if (d.downedTimer <= 0) {
        d.state = 'roam';
        d.jumpCooldown = 90;
      }
    }
    return;
  }
  if (d.state === 'intro') {
    // Fly (no gravity) from princess platform down to TENT_TOP with flapping wings.
    const tgt = 9; // Land on P4_RIGHT (endpoint of sprout H3) so dragon has a flight column.
    const tp = L4_PLATFORMS[tgt];
    const tcx = (tp.x1 + tp.x2) / 2;
    const tgtY = tp.y - DRAGON_H;
    const tgtX = tcx - DRAGON_W / 2;
    d.targetPlatIdx = tgt;
    d.airborne = true;
    // Smooth glide
    const dx = tgtX - d.x;
    const dy = tgtY - d.y;
    const dist = Math.hypot(dx, dy);
    const speed = 2.4;
    if (dist > speed) {
      d.x += (dx / dist) * speed;
      d.y += (dy / dist) * speed;
      d.facing = dx >= 0 ? 1 : -1;
      // Speed up wing flapping during flight
      if (d.frameTimer >= 8) {
        d.frameTimer = 0;
        d.frame = (d.frame + 1) % DRAGON_FRAMES;

      }
    } else {
      d.x = tgtX;
      d.y = tgtY;
      d.vx = 0; d.vy = 0;
      d.airborne = false;
      d.platIdx = tgt;
      d.state = 'roam';
      d.jumpCooldown = 90;
    }
    return;
  }

  // Dragon FLIES only along sprout columns (D, E, H1, H2, H3) — even when sprouts
  // are not grown. Within the same platform he walks horizontally.
  
  const flySpeed = 1.4 * s.diff.dragonSpeedMul;

  // Fire breath: only on ground. Cancel any active fire if airborne.
  if (d.airborne) {
    d.fireTimer = 0;
  } else {
    if (d.fireTimer > 0) {
      d.fireTimer--;
    } else if (d.fireCooldown > 0) {
      d.fireCooldown--;
    } else {
      // Ready to breathe: face the player and start.
      d.facing = s.player.x < d.x ? -1 : 1;
      d.fireTimer = FIRE_DURATION;
      d.fireCooldown = FIRE_COOLDOWN;
      playFireBreathSound();
    }
  }

  if (d.airborne) {
    const tp = L4_PLATFORMS[d.targetPlatIdx];
    // Target X is the sprout column we're flying down/up (locked at takeoff).
    const colX = (d as Dragon & { flyColX?: number }).flyColX ?? ((tp.x1 + tp.x2) / 2);
    const tgtX = Math.max(tp.x1 + 2, Math.min(tp.x2 - DRAGON_W - 2, colX - DRAGON_W / 2));
    const tgtY = tp.y - DRAGON_H;
    const dx = tgtX - d.x;
    const dy = tgtY - d.y;
    const dist = Math.hypot(dx, dy);
    if (dist < flySpeed) {
      d.x = tgtX; d.y = tgtY;
      d.vx = 0; d.vy = 0;
      d.airborne = false;
      d.platIdx = d.targetPlatIdx;
      d.jumpCooldown = 50 + Math.floor(Math.random() * 70);
    } else {
      d.x += (dx / dist) * flySpeed;
      d.y += (dy / dist) * flySpeed;
      d.facing = dx >= 0 ? 1 : -1;
      // Faster wing flap + flap sound on each cycle while flying.
      if (d.frameTimer >= 8) {
        d.frameTimer = 0;
        d.frame = (d.frame + 1) % DRAGON_FRAMES;

      }
    }
    return;
  }

  const plat = L4_PLATFORMS[d.platIdx];
  const leftLim = plat.x1 + 2;
  const rightLim = plat.x2 - DRAGON_W - 2;
  const p = s.player;

  // While breathing fire, dragon stops moving and does not take off.
  if (d.fireTimer > 0) {
    d.y = plat.y - DRAGON_H;
    return;
  }

  // Re-pick facing toward the caveman, but only when he is clearly to one side
  // (hysteresis deadband) to prevent left/right shaking when ~aligned vertically.
  if (Math.random() < 0.02) {
    const dx = (p.x + p.w / 2) - (d.x + DRAGON_W / 2);
    if (dx < -24) d.facing = -1;
    else if (dx > 24) d.facing = 1;
    // else: keep current facing — avoid jitter when nearly aligned.
  }
  const speed = 0.9 * s.diff.dragonSpeedMul;
  d.x += d.facing * speed;
  // From iter 2+, dragon can wrap around screen edges if a same-row platform
  // exists on the opposite side.
  const WRAP_PAIRS: Record<number, number> = { 5: 9, 9: 5, 12: 14, 14: 12, 15: 18, 18: 15, 19: 21, 21: 19 };
  const wrapPartner = (s.iter >= 2) ? WRAP_PAIRS[d.platIdx] : undefined;
  if (wrapPartner !== undefined) {
    if (d.x + DRAGON_W < 0) {
      const np = L4_PLATFORMS[wrapPartner];
      d.platIdx = wrapPartner; d.x = CANVAS_W - 2; d.y = np.y - DRAGON_H;
    } else if (d.x > CANVAS_W) {
      const np = L4_PLATFORMS[wrapPartner];
      d.platIdx = wrapPartner; d.x = 2 - DRAGON_W; d.y = np.y - DRAGON_H;
    } else {
      if (d.x < -DRAGON_W) d.x = -DRAGON_W;
      if (d.x > CANVAS_W) d.x = CANVAS_W;
    }
  } else {
    if (d.x < leftLim) { d.x = leftLim; d.facing = 1; }
    if (d.x > rightLim) { d.x = rightLim; d.facing = -1; }
  }
  d.y = plat.y - DRAGON_H;

  d.jumpCooldown--;
  if (d.jumpCooldown <= 0) {
    // Sprout pairs: dragon flies along sprout column between the two endpoints.
    const SPROUT_PAIRS: { col: number; a: number; b: number }[] = [
      { col: D_X,  a: D_TOP_PLAT_IDX,  b: D_BASE_PLAT_IDX  }, // 2 ↔ 5
      { col: E_X,  a: E_TOP_PLAT_IDX,  b: E_BASE_PLAT_IDX  }, // 0 ↔ 4
      { col: H1_X, a: H1_TOP_IDX,      b: H1_BOT_IDX        }, // 18 ↔ 23
      { col: H2_X, a: H2_TOP_IDX,      b: H2_BOT_IDX        }, // 12 ↔ 15
      { col: H3_X, a: H3_TOP_IDX,      b: H3_BOT_IDX        }, // 9 ↔ 14
      { col: H4_X, a: H4_TOP_IDX,      b: H4_BOT_IDX        }, // 5 ↔ 12
      { col: H5_X, a: H5_TOP_IDX,      b: H5_BOT_IDX        }, // 15 ↔ 21
      { col: H6_X, a: H6_TOP_IDX,      b: H6_BOT_IDX        }, // 14 ↔ 18
    ];
    // Horizontal neighbors on the same row — one platform at a time (static or moving).
    const HORIZ_PAIRS: [number, number][] = [
      [5, 6], [6, 7], [7, 8], [8, 9],     // P4
      [12, 13], [13, 14],                 // P3
      [15, 16], [16, 17], [17, 18],       // P2
      [19, 20], [20, 21],                 // P1
    ];
    // Vertical "open-air" hops between adjacent rows (one row up/down, non-sprout columns).
    // Dragon flies straight to the target platform's current center.
    const VERT_PAIRS: [number, number][] = [
      [7, 13],                            // tent_top ↔ P3 mover
      [6, 13], [8, 13],                   // P4 movers ↔ P3 mover
      [13, 16], [13, 17],                 // P3 mover ↔ P2 movers
      [16, 19], [16, 20], [17, 20], [17, 21], // P2 ↔ P1
    ];
    const options: { tgt: number; colX: number }[] = [];
    for (const sp of SPROUT_PAIRS) {
      if (sp.a === d.platIdx) options.push({ tgt: sp.b, colX: sp.col });
      else if (sp.b === d.platIdx) options.push({ tgt: sp.a, colX: sp.col });
    }
    const pushNeighbor = (other: number) => {
      const tp = L4_PLATFORMS[other];
      options.push({ tgt: other, colX: (tp.x1 + tp.x2) / 2 });
    };
    for (const [a, b] of HORIZ_PAIRS) {
      if (a === d.platIdx) pushNeighbor(b);
      else if (b === d.platIdx) pushNeighbor(a);
    }
    for (const [a, b] of VERT_PAIRS) {
      if (a === d.platIdx) pushNeighbor(b);
      else if (b === d.platIdx) pushNeighbor(a);
    }
    if (options.length > 0) {
      // Bias: stay on P4 row (dragon's home band where caveman stomps) with
      // P = 0.9 at iter 1, decreasing 0.05/iter, floor 0.5.
      const P4_ROW = new Set([5, 6, 7, 8, 9]);
      const stayProb = Math.max(0.5, 0.9 - 0.05 * Math.max(0, s.iter - 1));
      const p4Options = options.filter(o => P4_ROW.has(o.tgt));
      let pool = options;
      if (p4Options.length > 0 && Math.random() < stayProb) pool = p4Options;
      // Bias: chase caveman with P = 0.5 + 0.1*(iter-1), capped at 1.0.
      const chaseProb = Math.min(1, 0.5 + 0.1 * Math.max(0, s.iter - 1));
      const pc = s.player;
      const dragonCx = d.x + DRAGON_W / 2;
      const dragonCy = d.y + DRAGON_H / 2;
      const curDist = Math.hypot((pc.x + pc.w / 2) - dragonCx, (pc.y + pc.h / 2) - dragonCy);
      let pick = pool[Math.floor(Math.random() * pool.length)];
      if (Math.random() < chaseProb) {
        // Pick the option whose target platform brings dragon closest to caveman.
        let best = pick; let bestDist = Infinity;
        for (const o of pool) {
          const tp = L4_PLATFORMS[o.tgt];
          const tx = Math.max(tp.x1, Math.min(tp.x2 - DRAGON_W, o.colX - DRAGON_W / 2)) + DRAGON_W / 2;
          const ty = tp.y - DRAGON_H / 2;
          const dist = Math.hypot((pc.x + pc.w / 2) - tx, (pc.y + pc.h / 2) - ty);
          if (dist < bestDist) { bestDist = dist; best = o; }
        }
        // Only switch if it actually gets closer than the current position.
        if (bestDist < curDist) pick = best;
      }
      d.targetPlatIdx = pick.tgt;
      d.airborne = true;
      d.vx = 0; d.vy = 0;
      (d as Dragon & { flyColX?: number }).flyColX = pick.colX;
    } else {
      d.jumpCooldown = 60;
    }
  }
}

// ── Player ──────────────────────────────────────────────────
function tickPlayer(s: L4State, input: L4Input) {
  const p = s.player;
  if (p.kickTimer > 0) p.kickTimer--;

  // Climbing detection across D, E, H1..H6. When two ladders meet at a platform
  // (e.g. P3_RIGHT is top of H6 and bottom of H3), prefer the one that matches
  // the player's intent: input.up → sprout whose BOTTOM is here; input.down →
  // sprout whose TOP is here.
  let nearSprout: Sprout | null = null;
  const sproutList = [s.sproutD, s.sproutE, s.sproutH1, s.sproutH2, s.sproutH3, s.sproutH4, s.sproutH5, s.sproutH6, s.sproutH7];
  const matches: Sprout[] = [];
  for (const sp of sproutList) {
    if (sp.growProgress < 0.6) continue;
    const cx = p.x + p.w / 2;
    const topReach = sp.yBot - (sp.yBot - sp.yTop) * sp.growProgress;
    if (Math.abs(cx - sp.x) < 12 && p.y + p.h >= topReach - 4 && p.y <= sp.yBot + 20) {
      matches.push(sp);
    }
  }
  if (matches.length > 0) {
    nearSprout = matches[matches.length - 1];
    if (matches.length > 1) {
      const foot = p.y + p.h;
      // Strict containment first: prefer a sprout whose vertical range
      // actually contains the player's foot (mid-climb case).
      const contains = matches.find(sp => {
        const tr = sp.yBot - (sp.yBot - sp.yTop) * sp.growProgress;
        return foot > tr + 2 && foot < sp.yBot - 2;
      });
      if (contains) {
        nearSprout = contains;
      } else if (input.up) {
        // At a junction pressing up → pick the sprout whose BOTTOM is here.
        const pref = matches.find(sp => Math.abs(foot - sp.yBot) < 6);
        if (pref) nearSprout = pref;
      } else if (input.down) {
        // At a junction pressing down → pick the sprout whose TOP is here.
        const pref = matches.find(sp => {
          const tr = sp.yBot - (sp.yBot - sp.yTop) * sp.growProgress;
          return Math.abs(foot - tr) < 6;
        });
        if (pref) nearSprout = pref;
      }
    }
  }

  // Only latch onto a sprout when the player is grounded (not mid-jump).
  // Jumping through a sprout column (e.g. to kill a monkey on the other side)
  // must complete the jump instead of snapping onto the ladder.
  if (nearSprout && (input.up || input.down) && !p.climbing && p.onGround && !p.jumping) {
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

  // Jump / WATER actions
  if (input.jump && p.onGround) {
    // WATER E
    if (p.groundPlatIdx === E_BASE_PLAT_IDX && s.carrying === 'purple') {
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
        playJumpSound();
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
        playJumpSound();
        p.vy = JUMP_FORCE; p.onGround = false; p.jumping = true; p.jumpStartPlatIdx = p.groundPlatIdx;
      }
    }
    // WATER H4 (ladder from P3_LEFT up to P4_LEFT_D). Does NOT consume the can —
    // player still needs it to grow D afterwards.
    else if (p.groundPlatIdx === H4_BOT_IDX && s.carrying === 'green') {
      const cx = p.x + p.w / 2;
      if (Math.abs(cx - H4_X) < 22) {
        if (s.sproutH4.phase === 'seed' || s.sproutH4.phase === 'withering') {
          s.sproutH4.phase = 'growing';
        }
      } else {
        playJumpSound();
        p.vy = JUMP_FORCE; p.onGround = false; p.jumping = true; p.jumpStartPlatIdx = p.groundPlatIdx;
      }
    }
    else {
      playJumpSound();
      p.vy = JUMP_FORCE;
      p.onGround = false; p.jumping = true;
      p.jumpStartPlatIdx = p.groundPlatIdx;
    }
  }

  // Gravity & ride moving platform / ICE slide
  let carriedVx = 0;
  if (p.onGround && p.groundPlatIdx >= 0) {
    const pl = L4_PLATFORMS[p.groundPlatIdx];
    if (pl.moving) carriedVx = pl.moving.speed;
    if (pl.ice) {
      const slope = pl.slope || 0;
      const SLIDE = 2.6;
      p.vx = Math.sign(slope) * SLIDE; // override input
    }
  }
  p.vy += GRAVITY;
  p.x += p.vx + carriedVx;
  p.y += p.vy;
  // Screen wrap: leaving the left edge re-enters from the right at the same
  // height + velocity, and vice versa. Works mid-jump too, so the caveman can
  // complete the arc and stomp monkeys on the opposite side of the screen.
  if (p.x + p.w < 0) {
    p.x += CANVAS_W + p.w;
  } else if (p.x > CANVAS_W) {
    p.x -= CANVAS_W + p.w;
  }


  // Platform collisions — while jumping, allow landing on any platform on the same row
  // as the jump-start platform (so the caveman can hop onto adjacent moving platforms).
  const wasOnGround = p.onGround;
  p.onGround = false;
  const jumpStartY = (p.jumping && p.jumpStartPlatIdx >= 0) ? L4_PLATFORMS[p.jumpStartPlatIdx].y : -1;
  // Two-pass: prefer non-ice platforms so a moving platform passing under an
  // ice ramp's bottom edge (same y) doesn't get overridden by the ice slide.
  for (let pass = 0; pass < 2 && !p.onGround; pass++) {
    for (let i = 0; i < L4_PLATFORMS.length; i++) {
      const plat = L4_PLATFORMS[i];
      if (pass === 0 && plat.ice) continue;
      if (pass === 1 && !plat.ice) continue;
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
  }
  if (wasOnGround && !p.onGround && !p.jumping) {
    // free-fall
  }

  // Safety net: if caveman falls off the bottom of the screen, trigger death.
  if (p.y > CANVAS_H + 20 && !s.dying) {
    s.dying = true;
    s.deathReported = false;
    s.deathTimer = 0;
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
  // Update flying/landed state for each can.
  const updateCan = (c: Can | null) => {
    if (!c || c.picked) return;
    if (c.flying) {
      c.vy = (c.vy ?? 0) + GRAVITY;
      c.x += (c.vx ?? 0);
      c.y += (c.vy ?? 0);
      c.spin = (c.spin ?? 0) + 0.35;
      const ti = c.riderPlatIdx ?? -1;
      if (ti >= 0) {
        const pl = L4_PLATFORMS[ti];
        const landY = platY(pl, pl.x1 + (c.riderOffset ?? 0)) - 14;
        if (c.vy >= 0 && c.y >= landY) {
          c.y = landY;
          c.flying = false;
          c.vx = 0; c.vy = 0; c.spin = 0;
        }
      }
    } else if ((c.riderPlatIdx ?? -1) >= 0) {
      // Ride moving platforms.
      const pl = L4_PLATFORMS[c.riderPlatIdx!];
      const baseX = pl.x1 + (c.riderOffset ?? 0);
      c.x = baseX;
      c.y = platY(pl, baseX) - 14;
    }
  };
  updateCan(s.greenCan);
  updateCan(s.purpleCan);

  const pickup = (c: Can | null): boolean => {
    if (!c || c.picked || s.carrying || c.flying) return false;
    if (Math.abs((p.x + p.w / 2) - (c.x + 7)) < 16 && Math.abs((p.y + p.h) - (c.y + 14)) < 22) {
      c.picked = true;
      s.carrying = c.color;
      return true;
    }
    return false;
  };
  if (pickup(s.greenCan)) s.greenCan = null;
  if (pickup(s.purpleCan)) s.purpleCan = null;

  // Auto-water D when caveman stands on D base carrying green can.
  if (s.carrying === 'green' && p.onGround && p.groundPlatIdx === D_BASE_PLAT_IDX) {
    const cx = p.x + p.w / 2;
    if (Math.abs(cx - D_X) < 22) {
      if (s.sproutD.phase === 'seed' || s.sproutD.phase === 'withering') {
        s.sproutD.phase = 'growing';
        playWaterSproutSound();
        playVineGrowSound();
      }
      s.carrying = null;
    }
  }
  // Auto-water E when caveman stands on E base carrying purple can.
  if (s.carrying === 'purple' && p.onGround && p.groundPlatIdx === E_BASE_PLAT_IDX) {
    const cx = p.x + p.w / 2;
    if (Math.abs(cx - E_X) < 22) {
      if (s.sproutE.phase === 'seed') { s.sproutE.phase = 'growing'; s.sproutE.growProgress = 0; }
      s.sproutE.growProgress = Math.min(1, s.sproutE.growProgress + s.eGrowChunk);
      if (s.sproutE.growProgress >= 1) s.sproutE.phase = 'alive';
      playWaterSproutSound();
      playVineGrowSound();
      s.carrying = null;
      s.sproutD.phase = 'withering';
      if (s.dragon.hits < s.diff.hitsToKill) respawnMonkeyWave(s);
    }
  }
}

// ── Collisions ──────────────────────────────────────────────
function tickCollisions(s: L4State) {
  const p = s.player;
  const d = s.dragon;

  // Caveman stomp on dragon's head — falling onto dragon hits it
  if (d.state === 'roam' || d.state === 'downed') {
    const dw = DRAGON_W, dh = DRAGON_H;
    const overlapX = p.x < d.x + dw && p.x + p.w > d.x;
    const overlapY = p.y < d.y + dh && p.y + p.h > d.y;
    if (overlapX && overlapY && p.vy > 0 && (p.y + p.h) < d.y + 14) {
      d.hits++;
      const isKill = d.hits >= s.diff.hitsToKill;
      if (isKill) {
        // Final blow: spit last purple can, spin, fall to death.
        spawnCanFromDragon(s, 'purple');
        d.state = 'dying';
        d.dyingTimer = 240;
        d.dyingVy = -2;
        d.dyingSpin = 0;
        playDragonRoarSound();
      } else {
        d.state = 'downed';
        d.downedTimer = Math.round(3 * 60);
        // Purple can only spawns on the killing blow — not on intermediate bonks.
      }
      // bounce caveman off dragon's head
      p.vy = JUMP_FORCE * 0.8;
      p.jumping = true;
      p.onGround = false;
      s.invuln = Math.max(s.invuln, 20);
    }
  }

  // Rocks vs player
  if (s.invuln <= 0) {
    for (const r of s.rocks) {
      if (r.state === 'dead') continue;
      const dx = (p.x + p.w / 2) - r.x;
      const dy = (p.y + p.h / 2) - r.y;
      if (dx * dx + dy * dy < (r.r + 8) * (r.r + 8)) {
        loseLife(s); break;
      }
    }
  }

  // Monkey fireballs vs player
  if (s.invuln <= 0) {
    for (const fb of s.monkeyFireballs) {
      const dx = (p.x + p.w / 2) - fb.x;
      const dy = (p.y + p.h / 2) - fb.y;
      if (dx * dx + dy * dy < (fb.r + 8) * (fb.r + 8)) {
        loseLife(s); break;
      }
    }
  }

  // Volcano fireballs vs player
  if (s.invuln <= 0) {
    for (const fb of s.volcanoFireballs) {
      if (fb.landed) continue;
      const dx = (p.x + p.w / 2) - fb.x;
      const dy = (p.y + p.h / 2) - fb.y;
      if (dx * dx + dy * dy < (fb.radius + 8) * (fb.radius + 8)) {
        loseLife(s); break;
      }
    }
  }


  // Dragon touch
  if (s.invuln <= 0 && d.state === 'roam') {
    if (p.x < d.x + DRAGON_W && p.x + p.w > d.x && p.y < d.y + DRAGON_H && p.y + p.h > d.y) {
      loseLife(s);
      dragonHopUpAfterKill(s);
    }
  }

  // Dragon fire breath
  if (s.invuln <= 0 && d.state === 'roam' && d.fireTimer > 0 && !d.airborne) {
    const fr = getFireRect(d);
    if (p.x < fr.x + fr.w && p.x + p.w > fr.x && p.y < fr.y + fr.h && p.y + p.h > fr.y) {
      loseLife(s);
      dragonHopUpAfterKill(s);
    }
  }

  // Monkeys
  for (const m of s.monkeys) {
    if (!m.alive) continue;
    if (p.x < m.x + 14 && p.x + p.w > m.x && p.y < m.y + 16 && p.y + p.h > m.y) {
      if (p.vy > 0 && (p.y + p.h) < m.y + 12) {
        m.alive = false;
        playRobotKillSound();
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

function dragonHopUpAfterKill(s: L4State) {
  const d = s.dragon;
  if (d.state !== 'roam' || d.airborne) return;
  // Only when dragon is on the bottom-left platform (P1_LEFT = 21).
  if (d.platIdx !== 21) return;
  // Fly up the H5 sprout column to P2_LEFT (15).
  d.targetPlatIdx = 15;
  (d as Dragon & { flyColX?: number }).flyColX = H5_X;
  d.airborne = true;
  d.vx = 0; d.vy = 0;
  d.fireTimer = 0;
  d.jumpCooldown = 60;
}

function loseLife(s: L4State) {
  if (s.dying) return;
  s.dying = true;
  s.deathTimer = 0;
  s.deathReported = false;
  playHitSound();
}

// ── Ending ──────────────────────────────────────────────────
function tickEnding(s: L4State) {
  const e = s.ending;
  e.timer++;
  switch (e.phase) {
    case 'hug':
      // "Thank you, my hero!" for 2 seconds
      if (e.timer >= 120) { e.phase = 'pause'; e.timer = 0; }
      break;
    case 'pause':
      // "But the happiness didn't last long..." for 2 seconds
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
    // underside slab — brown dirt for static, icy-blue for ice ramps; movers stay floating
    if (!plat.moving) {
      ctx.fillStyle = plat.ice ? '#3A7FA8' : '#6B4226';
      ctx.beginPath();
      ctx.moveTo(plat.x1, y1 + 2);
      ctx.lineTo(plat.x2, y2 + 2);
      ctx.lineTo(plat.x2, y2 + 8);
      ctx.lineTo(plat.x1, y1 + 8);
      ctx.closePath();
      ctx.fill();
    }
    // top surface — blue for ice, green-light for movers, green for static
    ctx.fillStyle = plat.ice ? '#BDE8F7' : (plat.moving ? '#FF5252' : '#3CB043');
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
  const pFrameW = sprites.princess.width / 5;
  const pFrameIdx = s.showHelp ? 2 : 0;
  if (sprites.princess.complete) {
    ctx.drawImage(sprites.princess, pFrameIdx * pFrameW, 0, pFrameW, sprites.princess.height,
      s.princessX, s.princessY, PRINCESS_W, PRINCESS_H);
  } else {
    ctx.fillStyle = '#ff80c0'; ctx.fillRect(s.princessX, s.princessY, PRINCESS_W, PRINCESS_H);
  }
  if (s.showHelp) {
    ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 14px "Press Start 2P", monospace';
    ctx.fillText('HELP!', s.princessX - 4, s.princessY - 8);
  }

  // Sprouts
  drawSprout(ctx, s.sproutD);
  drawSprout(ctx, s.sproutE);
  drawSprout(ctx, s.sproutH1);
  drawSprout(ctx, s.sproutH2);
  drawSprout(ctx, s.sproutH3);
  drawSprout(ctx, s.sproutH4);
  drawSprout(ctx, s.sproutH5);
  drawSprout(ctx, s.sproutH6);
  drawSprout(ctx, s.sproutH7);

  // Cans
  if (s.greenCan) drawCan(ctx, sprites, s.greenCan);
  if (s.purpleCan) drawCan(ctx, sprites, s.purpleCan);

  if (s.carrying) {
    const p = s.player;
    const cx = p.x + p.w / 2;
    const cy = p.y - 6;
    const glow = s.carrying === 'green'
      ? 'rgba(116,224,127,0.45)'
      : 'rgba(176,120,230,0.45)';
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();
    const canImg = sprites.wateringCan;
    const drawW = 20, drawH = 16;
    if (canImg && canImg.complete && canImg.naturalWidth > 0) {
      ctx.drawImage(canImg, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
    }
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

  // Rocks — match Level 1 exactly: use a single frame (1/5 of the sheet),
  // aspect-correct, rotated by rolled distance.
  {
    const img = sprites.rockWheel;
    const ready = img && img.complete && img.naturalWidth > 0;
    const ROCK_FRAMES = 5;
    const frameW = ready ? img.naturalWidth / ROCK_FRAMES : 0;
    const frameH = ready ? img.naturalHeight : 0;
    for (const r of s.rocks) {
      if (r.state === 'dead') continue;
      const baseW = 14;
      const diameter = (baseW + 4) * 1.5;
      const aspect = ready && frameH > 0 ? frameW / frameH : 1;
      const drawH = diameter;
      const drawW = diameter * aspect;
      const radius = diameter / 2;
      const dir = r.vx >= 0 ? 1 : -1;
      const angle = ((r.rollPhase ?? 0) / radius) * dir;
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(angle);
      if (ready) {
        ctx.drawImage(img, 0, 0, frameW, frameH, -drawW / 2, -drawH / 2, drawW, drawH);
      } else {
        ctx.fillStyle = '#888';
        ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  // Monkey-thrown apples (same look as Level 2 apples)
  for (const fb of s.monkeyFireballs) {
    const cx = fb.x;
    const cy = fb.y;
    const drawH = 7;
    // body
    ctx.fillStyle = '#d6201f';
    ctx.beginPath();
    ctx.arc(cx, cy, 7 / 2 + 1, 0, Math.PI * 2);
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

  // Volcano fireballs — red-hot lava rocks
  for (const fb of s.volcanoFireballs) {
    if (fb.landed) continue;
    ctx.save();
    ctx.fillStyle = 'rgba(255,80,20,0.35)';
    ctx.beginPath(); ctx.arc(fb.x, fb.y, fb.radius + 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d63a0f';
    ctx.beginPath(); ctx.arc(fb.x, fb.y, fb.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffae3a';
    ctx.beginPath(); ctx.arc(fb.x - 1, fb.y - 1, fb.radius * 0.5, 0, Math.PI * 2); ctx.fill();
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

  // (dragon-hits HUD removed)

  // Ending overlay
  if (s.ending.active) {
    const e = s.ending;
    if (e.phase === 'hug') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(140, 60, 180, 36);
      ctx.fillStyle = '#000';
      ctx.font = '14px sans-serif';
      ctx.fillText('Thank you, my hero!', 158, 84);
    } else if (e.phase === 'pause') {
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(60, 60, 340, 36);
      ctx.fillStyle = '#fff';
      ctx.font = '13px sans-serif';
      ctx.fillText("But the happiness didn't last long...", 78, 84);
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
  // Seed visualization (always show where the sprout will grow).
  if (sp.growProgress <= 0) {
    const lx = sp.x - 6;
    const by = sp.yBot;
    ctx.fillStyle = '#3a2418';
    ctx.fillRect(lx, by - 4, 12, 4);
    ctx.fillStyle = sp.isPurple ? '#9b59b6' : '#3CB043';
    ctx.beginPath();
    ctx.arc(sp.x, by - 6, 3, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
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
  const cx = c.x + 7, cy = c.y + 7;
  ctx.save();
  if (c.flying) {
    ctx.translate(cx, cy);
    ctx.rotate(c.spin ?? 0);
    ctx.translate(-cx, -cy);
  }
  // Unified glow: green or purple circle behind the sprite.
  ctx.fillStyle = c.color === 'green'
    ? 'rgba(116, 224, 127, 0.45)'
    : 'rgba(176, 120, 230, 0.45)';
  ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
  if (sprites.wateringCan.complete) {
    const drawW = 22, drawH = 18;
    ctx.drawImage(sprites.wateringCan, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
  } else {
    ctx.fillStyle = c.color === 'green' ? '#3CB043' : '#9b59b6';
    ctx.fillRect(c.x - 2, c.y, 18, 14);
  }
  ctx.restore();
}

function drawDragon(ctx: CanvasRenderingContext2D, sprites: L4Sprites, d: Dragon) {
  if (d.state === 'dead') return;
  const img = sprites.dragonAngry && sprites.dragonAngry.complete && sprites.dragonAngry.naturalWidth > 0
    ? sprites.dragonAngry : sprites.dragonFire;
  ctx.save();
  if (d.state === 'downed') ctx.globalAlpha = 0.7;
  if (d.state === 'dying') {
    ctx.globalAlpha = 0.85;
    const cx = d.x + DRAGON_W / 2;
    const cy = d.y + DRAGON_H / 2;
    ctx.translate(cx, cy);
    ctx.rotate(d.dyingSpin ?? 0);
    ctx.translate(-cx, -cy);
  }

  // Flapping wings overlay during intro flight
  if (d.state === 'intro' || (d.state === 'roam' && d.airborne)) {
    const cx = d.x + DRAGON_W / 2;
    const cy = d.y + DRAGON_H * 0.45;
    // Wing angle oscillates with frame for flap effect
    const flap = Math.sin(d.frame * (Math.PI * 2 / DRAGON_FRAMES)) * 0.9;
    const wingLen = 28;
    const wingH = 14;
    ctx.fillStyle = '#2e5a2a';
    ctx.strokeStyle = '#1a3a18';
    ctx.lineWidth = 1.5;
    // Left wing
    ctx.save();
    ctx.translate(cx - 10, cy);
    ctx.rotate(-0.4 + flap);
    ctx.beginPath();
    ctx.ellipse(-wingLen / 2, 0, wingLen / 2, wingH / 2, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // Right wing
    ctx.save();
    ctx.translate(cx + 10, cy);
    ctx.rotate(0.4 - flap);
    ctx.beginPath();
    ctx.ellipse(wingLen / 2, 0, wingLen / 2, wingH / 2, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

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

  // Fire breath — flickering layered flame from mouth, fanning down to ground.
  if (d.fireTimer > 0 && d.state === 'roam' && !d.airborne) {
    const fr = getFireRect(d);
    const mouthY = d.y + DRAGON_H * 0.38;
    const mouthX = d.facing >= 0 ? d.x + DRAGON_W - 10 : d.x + 10;
    const tipX = d.facing >= 0 ? fr.x + fr.w : fr.x;
    const groundY = fr.y + fr.h;
    const dir = d.facing >= 0 ? 1 : -1;
    const span = Math.abs(tipX - mouthX);
    const t = d.fireTimer / FIRE_DURATION; // 1 → 0
    const reach = 0.35 + 0.65 * (1 - Math.abs(t - 0.5) * 2); // ramp up then down

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Layered overlapping puffs along the flame path.
    const PUFFS = 14;
    for (let i = 0; i < PUFFS; i++) {
      const u = (i + 1) / PUFFS;
      if (u > reach) break;
      // Position interpolates from mouth toward tip horizontally, curving down to ground.
      const px = mouthX + dir * span * u;
      const curve = Math.pow(u, 1.6);
      const py = mouthY + (groundY - mouthY) * curve;
      // Flicker
      const flick = Math.sin(d.frame * 0.9 + i * 1.7) * 2 + Math.sin(d.frame * 0.4 + i) * 1.5;
      const rad = 4 + u * 14 + Math.abs(Math.sin(d.frame * 0.5 + i * 0.8)) * 3;

      // Outer red/orange glow
      const g1 = ctx.createRadialGradient(px, py + flick, 0, px, py + flick, rad * 1.6);
      g1.addColorStop(0, 'rgba(255,160,40,0.55)');
      g1.addColorStop(0.6, 'rgba(220,60,20,0.35)');
      g1.addColorStop(1, 'rgba(120,10,0,0)');
      ctx.fillStyle = g1;
      ctx.beginPath(); ctx.arc(px, py + flick, rad * 1.6, 0, Math.PI * 2); ctx.fill();

      // Inner yellow/white-hot core
      const coreR = rad * (0.55 - u * 0.25);
      if (coreR > 1) {
        const g2 = ctx.createRadialGradient(px, py + flick * 0.5, 0, px, py + flick * 0.5, coreR);
        g2.addColorStop(0, 'rgba(255,255,220,0.95)');
        g2.addColorStop(0.5, 'rgba(255,210,80,0.7)');
        g2.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(px, py + flick * 0.5, coreR, 0, Math.PI * 2); ctx.fill();
      }
    }

    // A few extra spark dots near the tip for liveliness
    for (let k = 0; k < 6; k++) {
      const u = 0.6 + Math.random() * 0.4 * reach;
      const px = mouthX + dir * span * u + (Math.random() - 0.5) * 6;
      const py = mouthY + (groundY - mouthY) * Math.pow(u, 1.6) + (Math.random() - 0.5) * 8;
      ctx.fillStyle = 'rgba(255,230,120,0.9)';
      ctx.beginPath(); ctx.arc(px, py, 1.5 + Math.random() * 1.5, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
  }

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
