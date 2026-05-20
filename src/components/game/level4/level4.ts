// ============================================================
// Level 4 — Popeye-style dragon boss fight (self-contained)
// ------------------------------------------------------------
// Nothing in here is imported by L1/L2/L3 and vice-versa (the
// only shared dependency is the canvas dimensions constant).
// ============================================================

import { CANVAS_W, CANVAS_H } from '../constants';
import { LEVEL4_PARAMS, getLevel4Difficulty, type Level4Difficulty } from './params';

const GRAVITY = 0.38;
const MOVE_SPEED = 1.9;
const JUMP_FORCE = -8;
const CLIMB_SPEED = 1.5;

// ── Layout ───────────────────────────────────────────────────
export const L4_PLATFORMS: { y: number; x1: number; x2: number }[] = [
  { y: 432, x1: 0,  x2: CANVAS_W },                  // P0 ground
  { y: 368, x1: 0,  x2: CANVAS_W },                  // P1
  { y: 304, x1: 0,  x2: CANVAS_W },                  // P2
  { y: 240, x1: 0,  x2: CANVAS_W },                  // P3
  { y: 176, x1: 0,  x2: CANVAS_W },                  // P4
  { y: 112, x1: 0,  x2: CANVAS_W },                  // P5 top (princess/dragon/volcano)
];

interface L4Ladder { x: number; yTop: number; yBot: number; isPurpleTop?: boolean; gapIdx: number }
type SproutPhase = 'idle' | 'wither' | 'dormant' | 'grow';
interface Sprout {
  ladderIdx: number;
  isTop: boolean;            // true for the purple-top sprout (only sprout on P4→P5)
  grown: boolean;
  growProgress: number;      // 0..1
  growFrames: number;
  phase: SproutPhase;
  regrowTimer: number;
  aliveTimer: number;
  watered?: boolean;
  gapIdx: number;
  inUse?: boolean;
}

interface Heart {
  x: number;
  y: number;
  vx: number;
  vy: number;
  swayPhase: number;
  rot: number;
  landed: boolean;
  age: number;
}

type DragonState = 'intro' | 'walk' | 'shrunk' | 'birdStun' | 'flash' | 'dying' | 'dead';
interface Dragon {
  x: number;
  y: number;
  vy: number;
  airborne: boolean;
  platIdx: number;           // current platform index (when grounded)
  targetPlatIdx: number;     // landing target while airborne
  jumpCooldown: number;      // frames until allowed to jump again
  facing: number;            // -1 left, +1 right
  state: DragonState;
  scale: number;             // 1 normal, 0.5 shrunk
  hits: number;
  shrinkTimer: number;       // frames remaining in shrunk+flash window
  flashOn: boolean;
  flashColor: 'g' | 'p';
  flashTickT: number;
  stunTimer: number;
  dyingTimer: number;
}

interface Monkey {
  alive: boolean;
  x: number; y: number;
  platIdx: number;
  vx: number;
  facing: number;
  walkFrame: number; walkTimer: number;
  respawnTimer: number;      // when <=0 and !alive → spawn
  respawnPlatIdx: number;
}

interface Rock { x: number; y: number; vx: number; vy: number; r: number; age: number; ttl: number }

interface Player {
  x: number; y: number; w: number; h: number;
  vx: number; vy: number;
  onGround: boolean;
  climbing: boolean;
  facing: number;
  jumping: boolean;
  walkFrame: number; walkTimer: number;
  jumpFrame: number; jumpTimer: number;
  climbFrame: number; climbTimer: number;
}

interface Ending {
  active: boolean;
  phase: 'hug' | 'pause' | 'kidnap' | 'follow' | 'done';
  timer: number;
  newDragonX: number;
}

export interface L4State {
  iter: number;
  diff: Level4Difficulty;
  player: Player;
  dragon: Dragon;
  hearts: Heart[];
  nextHeartTimer: number;
  heartMeter: number;            // count of hearts picked up since last fill
  meterFull: boolean;
  ladders: L4Ladder[];
  sprouts: Sprout[];
  purpleLadderIdx: number;
  monkeys: Monkey[];
  rocks: Rock[];
  nextRockTimer: number;
  volcanoX: number;
  princessX: number;
  princessY: number;
  dragonHomeY: number;
  purpleCan: { x: number; y: number; picked: boolean; visible: boolean } | null;
  hasPurpleCan: boolean;
  purpleSeedPlanted: boolean;
  ending: Ending;
  won: boolean;
  died: boolean;
  invuln: number;
  birdSpin: number;
  // For run-away AI
  rng: () => number;
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

const DRAGON_W = 40, DRAGON_H = 56;
const PRINCESS_W = 30, PRINCESS_H = 44;

// ── Init ─────────────────────────────────────────────────────
export function initLevel4(iter: number): L4State {
  const diff = getLevel4Difficulty(iter);
  const ladders: L4Ladder[] = [];
  // 4 gaps below the top (P0→P1, P1→P2, P2→P3, P3→P4): 2 sprouts per gap (L+R)
  for (let g = 0; g < 4; g++) {
    const bot = L4_PLATFORMS[g].y;
    const top = L4_PLATFORMS[g + 1].y;
    const leftX = 60 + Math.random() * 100;          // 60..160
    const rightX = CANVAS_W - 60 - Math.random() * 100; // 352..452
    ladders.push({ x: leftX, yTop: top, yBot: bot, gapIdx: g });
    ladders.push({ x: rightX, yTop: top, yBot: bot, gapIdx: g });
  }
  // Top gap P4→P5: purple top sprout (right side, away from princess)
  const purpleX = CANVAS_W - 80;
  ladders.push({ x: purpleX, yTop: L4_PLATFORMS[5].y, yBot: L4_PLATFORMS[4].y, isPurpleTop: true, gapIdx: -1 });
  const purpleLadderIdx = ladders.length - 1;

  const sprouts: Sprout[] = ladders.map((l, i) => ({
    ladderIdx: i,
    isTop: !!l.isPurpleTop,
    grown: !l.isPurpleTop,
    growProgress: l.isPurpleTop ? 0 : 1,
    growFrames: rollGrow(),
    phase: (l.isPurpleTop ? 'dormant' : 'idle') as SproutPhase,
    regrowTimer: 0,
    aliveTimer: rollAlive(),
    watered: false,
    gapIdx: l.gapIdx,
  }));

  // Monkeys distributed randomly across P1..P4 (not top, not ground)
  const monkeys: Monkey[] = [];
  for (let i = 0; i < diff.monkeyCount; i++) {
    const platIdx = 1 + Math.floor(Math.random() * 4); // 1..4
    monkeys.push(makeMonkey(platIdx));
  }

  const dragonHomeY = L4_PLATFORMS[5].y - DRAGON_H;
  const state: L4State = {
    iter,
    diff,
    player: {
      x: 60, y: L4_PLATFORMS[0].y - 24, w: 16, h: 24,
      vx: 0, vy: 0, onGround: false, climbing: false, facing: 1, jumping: false,
      walkFrame: 0, walkTimer: 0, jumpFrame: 0, jumpTimer: 0, climbFrame: 0, climbTimer: 0,
    },
    dragon: {
      x: CANVAS_W * 0.55,
      y: dragonHomeY,
      vy: 0,
      airborne: true,
      platIdx: 5,
      targetPlatIdx: 4,
      jumpCooldown: 90,
      facing: -1,
      state: 'intro',
      scale: 1,
      hits: 0,
      shrinkTimer: 0,
      flashOn: false,
      flashColor: 'g',
      flashTickT: 0,
      stunTimer: 0,
      dyingTimer: 0,
    },
    hearts: [],
    nextHeartTimer: 60,
    heartMeter: 0,
    meterFull: false,
    ladders,
    sprouts,
    purpleLadderIdx,
    monkeys,
    rocks: [],
    nextRockTimer: 60 * LEVEL4_PARAMS.FIREBALL_INTERVAL_SEC,
    volcanoX: CANVAS_W - 60,
    princessX: 80,
    princessY: L4_PLATFORMS[5].y - PRINCESS_H,
    dragonHomeY,
    purpleCan: null,
    hasPurpleCan: false,
    purpleSeedPlanted: false,
    ending: { active: false, phase: 'hug', timer: 0, newDragonX: -DRAGON_W },
    won: false,
    died: false,
    invuln: 60,
    birdSpin: 0,
    rng: Math.random,
  };
  return state;
}

function rollGrow(): number { return Math.max(1, Math.round(LEVEL4_PARAMS.SPROUT_GROW_FRAMES * (0.8 + Math.random() * 0.4))); }
function rollAlive(): number {
  const s = LEVEL4_PARAMS.SPROUT_ALIVE_MIN_SEC + Math.random() * (LEVEL4_PARAMS.SPROUT_ALIVE_MAX_SEC - LEVEL4_PARAMS.SPROUT_ALIVE_MIN_SEC);
  return Math.round(s * 60);
}
function rollRegrow(): number {
  const s = LEVEL4_PARAMS.SPROUT_REGROW_MIN_SEC + Math.random() * (LEVEL4_PARAMS.SPROUT_REGROW_MAX_SEC - LEVEL4_PARAMS.SPROUT_REGROW_MIN_SEC);
  return Math.round(s * 60);
}
function makeMonkey(platIdx: number): Monkey {
  const plat = L4_PLATFORMS[platIdx];
  return {
    alive: true,
    x: plat.x1 + 40 + Math.random() * Math.max(20, plat.x2 - plat.x1 - 80),
    y: plat.y - 24,
    platIdx,
    vx: (Math.random() < 0.5 ? -1 : 1) * 0.6,
    facing: 1,
    walkFrame: 0, walkTimer: 0,
    respawnTimer: 0,
    respawnPlatIdx: platIdx,
  };
}

// ── Input ────────────────────────────────────────────────────
export interface L4Input { left: boolean; right: boolean; up: boolean; down: boolean; jump: boolean }

// ── Update ───────────────────────────────────────────────────
export function updateLevel4(s: L4State, input: L4Input): { died: boolean; won: boolean } {
  if (s.ending.active) {
    tickEnding(s);
    return { died: false, won: s.won };
  }
  if (s.died) return { died: true, won: false };
  if (s.invuln > 0) s.invuln--;

  tickHeartSpawner(s);
  tickHearts(s);
  tickSprouts(s);
  tickDragon(s, input);
  tickMonkeys(s);
  tickRocks(s);
  tickPlayer(s, input);
  tickPurpleCan(s);
  tickCollisions(s);

  return { died: s.died, won: s.won };
}

// ── Heart spawn / leaf fall ─────────────────────────────────
function tickHeartSpawner(s: L4State) {
  if (s.dragon.state === 'dead' || s.dragon.state === 'dying') return;
  s.nextHeartTimer--;
  if (s.nextHeartTimer <= 0) {
    const min = LEVEL4_PARAMS.HEART_SPAWN_MIN_SEC * 60;
    const max = LEVEL4_PARAMS.HEART_SPAWN_MAX_SEC * 60;
    s.nextHeartTimer = Math.round(min + Math.random() * (max - min));
    s.hearts.push({
      x: s.princessX + PRINCESS_W / 2,
      y: s.princessY,
      vx: (Math.random() - 0.5) * 0.3,
      vy: 0,
      swayPhase: Math.random() * Math.PI * 2,
      rot: 0,
      landed: false,
      age: 0,
    });
  }
}
function tickHearts(s: L4State) {
  for (const h of s.hearts) {
    if (h.landed) continue;
    h.age++;
    // Leaf-fall: gravity-capped + horizontal sine sway
    h.vy = Math.min(LEVEL4_PARAMS.HEART_VY_MAX, h.vy + LEVEL4_PARAMS.HEART_VY_ACCEL);
    const sway = Math.sin(h.age / 60 * Math.PI * 2 * LEVEL4_PARAMS.HEART_SWAY_HZ + h.swayPhase) * LEVEL4_PARAMS.HEART_SWAY_AMP;
    h.x += h.vx + sway * 0.5;
    h.y += h.vy;
    h.rot = Math.sin(h.age / 30) * 0.4;
    // Land on first platform top intersected (skipping top platform).
    for (let i = 0; i < L4_PLATFORMS.length - 1; i++) {
      const p = L4_PLATFORMS[i];
      if (h.x >= p.x1 && h.x <= p.x2 && h.y >= p.y - 6 && h.y <= p.y + 2) {
        h.y = p.y - 6;
        h.landed = true;
        h.vy = 0;
        break;
      }
    }
    // Off-screen cleanup
    if (h.x < -20 || h.x > CANVAS_W + 20 || h.y > CANVAS_H + 20) h.landed = true;
  }
  // Remove very old landed hearts (rotted) after 12s
  s.hearts = s.hearts.filter(h => !(h.landed && h.age > 60 * 12) && !(h.x < -20 || h.x > CANVAS_W + 20));
}

// ── Sprouts ─────────────────────────────────────────────────
function grownInGap(s: L4State, gapIdx: number, excludeIdx = -1): number {
  let n = 0;
  for (let i = 0; i < s.sprouts.length; i++) {
    if (i === excludeIdx) continue;
    const sp = s.sprouts[i];
    if (sp.isTop) continue;
    if (sp.gapIdx === gapIdx && sp.grown) n++;
  }
  return n;
}
function tickSprouts(s: L4State) {
  for (let idx = 0; idx < s.sprouts.length; idx++) {
    const sp = s.sprouts[idx];
    switch (sp.phase) {
      case 'idle':
        if (!sp.isTop) {
          if (!sp.inUse) {
            sp.aliveTimer--;
            if (sp.aliveTimer <= 0) {
              if (grownInGap(s, sp.gapIdx, idx) === 0) sp.aliveTimer = rollAlive();
              else { sp.grown = false; sp.phase = 'wither'; }
            }
          }
        }
        break;
      case 'wither':
        if (sp.inUse) { sp.phase = 'idle'; sp.grown = true; sp.aliveTimer = rollAlive(); break; }
        sp.growProgress = Math.max(0, sp.growProgress - 1 / sp.growFrames);
        if (sp.growProgress <= 0) {
          sp.growProgress = 0;
          sp.phase = 'dormant';
          sp.regrowTimer = sp.isTop ? -1 : rollRegrow();
        }
        break;
      case 'dormant':
        if (sp.isTop) break;
        sp.regrowTimer--;
        if (grownInGap(s, sp.gapIdx, idx) === 0 && sp.regrowTimer > 0) sp.regrowTimer = 0;
        if (sp.regrowTimer <= 0) { sp.phase = 'grow'; sp.growFrames = rollGrow(); }
        break;
      case 'grow':
        sp.growProgress = Math.min(1, sp.growProgress + 1 / sp.growFrames);
        if (sp.growProgress >= 1) {
          sp.growProgress = 1;
          sp.phase = 'idle';
          sp.grown = true;
          if (!sp.isTop) sp.aliveTimer = rollAlive();
        }
        break;
    }
    sp.inUse = false;
  }
}

// ── Dragon FSM ──────────────────────────────────────────────
function tickDragon(s: L4State, _input: L4Input) {
  const d = s.dragon;
  const p = s.player;
  const cavemanSpeed = MOVE_SPEED;
  const normalSpeed = s.diff.dragonSpeedMul * cavemanSpeed;

  // Shared airborne physics (for intro/walk jumps; not shrunk/stun/dying).
  if (d.airborne && (d.state === 'intro' || d.state === 'walk')) {
    d.vy += GRAVITY;
    d.y += d.vy;
    // drift horizontally a bit toward x within bounds
    d.x = Math.max(8, Math.min(CANVAS_W - 8 - DRAGON_W * d.scale, d.x));
    // Land on target platform when crossing downward, or any platform when moving up & overlapping
    const targetY = L4_PLATFORMS[d.targetPlatIdx].y - DRAGON_H * d.scale;
    if (d.vy >= 0 && d.y >= targetY) {
      d.y = targetY;
      d.vy = 0;
      d.airborne = false;
      d.platIdx = d.targetPlatIdx;
      d.jumpCooldown = 60 + Math.floor(Math.random() * 180);
      if (d.state === 'intro') d.state = 'walk';
    }
    return;
  }

  switch (d.state) {
    case 'intro': {
      // Hop downward off the top platform toward P4.
      d.airborne = true;
      d.vy = -2;
      d.targetPlatIdx = 4;
      break;
    }
    case 'walk': {
      // Walk along current platform, biased toward caveman.
      const plat = L4_PLATFORMS[d.platIdx];
      const targetX = p.x;
      const dx = targetX - d.x;
      const dir = dx > 2 ? 1 : dx < -2 ? -1 : d.facing;
      d.facing = dir;
      d.x += dir * normalSpeed * 0.6;
      d.x = Math.max(plat.x1 + 4, Math.min(plat.x2 - DRAGON_W * d.scale - 4, d.x));
      d.y = plat.y - DRAGON_H * d.scale;

      // Random jump up/down to adjacent platform.
      d.jumpCooldown--;
      if (d.jumpCooldown <= 0) {
        const canUp = d.platIdx < 5;
        const canDown = d.platIdx > 1; // never jump onto ground (P0)
        const wantTowardPlayer = Math.abs(p.x - d.x) < 40;
        const playerAbove = (p.y + p.h) < plat.y - 20;
        let target = d.platIdx;
        if (canUp && (playerAbove || (wantTowardPlayer && Math.random() < 0.5))) target = d.platIdx + 1;
        else if (canDown && Math.random() < 0.5) target = d.platIdx - 1;
        else if (canUp) target = d.platIdx + 1;
        if (target !== d.platIdx) {
          d.targetPlatIdx = target;
          d.airborne = true;
          d.vy = target > d.platIdx ? -7.5 : -3.5;
        } else {
          d.jumpCooldown = 60;
        }
      }

      if (s.meterFull) {
        d.state = 'shrunk';
        d.scale = 0.5;
        d.shrinkTimer = Math.round(s.diff.shrinkSec * 60);
        s.heartMeter = 0;
        s.meterFull = false;
      }
      break;
    }
    case 'shrunk': {
      // Run AWAY from caveman at 50% normal speed along current platform.
      const runSpeed = normalSpeed * 0.5;
      const plat = L4_PLATFORMS[d.platIdx];
      const dx = p.x - d.x;
      const dir = dx > 0 ? -1 : 1;
      d.facing = dir;
      d.x += dir * runSpeed;
      d.x = Math.max(plat.x1 + 4, Math.min(plat.x2 - DRAGON_W * d.scale - 4, d.x));
      d.y = plat.y - DRAGON_H * d.scale;
      d.shrinkTimer--;
      if (d.shrinkTimer <= LEVEL4_PARAMS.FLASH_SEC * 60) {
        d.flashTickT++;
        if (d.flashTickT > 6) { d.flashTickT = 0; d.flashColor = d.flashColor === 'g' ? 'p' : 'g'; }
        d.flashOn = true;
      }
      if (d.shrinkTimer <= 0) {
        d.state = 'walk';
        d.scale = 1;
        d.flashOn = false;
      }
      break;
    }
    case 'birdStun': {
      d.stunTimer--;
      s.birdSpin += 0.25;
      if (d.stunTimer <= 0) {
        if (d.hits >= s.diff.hitsToKill) {
          d.state = 'dying';
          d.dyingTimer = 60;
        } else {
          d.state = 'shrunk';
          if (d.shrinkTimer <= 0) d.shrinkTimer = 60;
        }
      }
      break;
    }
    case 'flash':
      break;
    case 'dying': {
      d.dyingTimer--;
      d.y += 1.5;
      if (d.dyingTimer <= 0) {
        d.state = 'dead';
        const platIdx = 1 + Math.floor(Math.random() * 4);
        const plat = L4_PLATFORMS[platIdx];
        const cx = plat.x1 + 40 + Math.random() * Math.max(20, plat.x2 - plat.x1 - 80);
        s.purpleCan = { x: cx, y: plat.y - 14, picked: false, visible: true };
      }
      break;
    }
    case 'dead':
      break;
  }
}

// ── Monkeys ─────────────────────────────────────────────────
function tickMonkeys(s: L4State) {
  for (const m of s.monkeys) {
    if (!m.alive) {
      m.respawnTimer--;
      if (m.respawnTimer <= 0) {
        const plat = L4_PLATFORMS[m.respawnPlatIdx];
        m.alive = true;
        m.x = plat.x1 + 40 + Math.random() * Math.max(20, plat.x2 - plat.x1 - 80);
        m.y = plat.y - 24;
        m.platIdx = m.respawnPlatIdx;
        m.vx = (Math.random() < 0.5 ? -1 : 1) * 0.6;
      }
      continue;
    }
    const plat = L4_PLATFORMS[m.platIdx];
    m.x += m.vx;
    if (m.x < plat.x1 + 4) { m.x = plat.x1 + 4; m.vx = Math.abs(m.vx); }
    if (m.x > plat.x2 - 20) { m.x = plat.x2 - 20; m.vx = -Math.abs(m.vx); }
    m.facing = m.vx >= 0 ? 1 : -1;
    m.walkTimer++;
    if (m.walkTimer >= 6) { m.walkTimer = 0; m.walkFrame = (m.walkFrame + 1) % 5; }
  }
}

// ── Rocks (volcano) ─────────────────────────────────────────
function tickRocks(s: L4State) {
  s.nextRockTimer--;
  if (s.nextRockTimer <= 0) {
    s.nextRockTimer = Math.round(LEVEL4_PARAMS.FIREBALL_INTERVAL_SEC * 60);
    // Spawn rock arcing leftward from volcano
    const flight = LEVEL4_PARAMS.FIREBALL_FLIGHT_SEC * 60;
    const sx = s.volcanoX, sy = L4_PLATFORMS[5].y - 8;
    const targetX = 60 + Math.random() * (CANVAS_W - 120);
    const targetY = L4_PLATFORMS[0].y - 10;
    const t = flight;
    const vx = (targetX - sx) / t;
    const g = 0.06;
    const vy = (targetY - sy - 0.5 * g * t * t) / t;
    s.rocks.push({ x: sx, y: sy, vx, vy, r: LEVEL4_PARAMS.FIREBALL_START_R, age: 0, ttl: flight + 30 });
  }
  for (const r of s.rocks) {
    r.age++;
    r.vy += 0.06;
    r.x += r.vx;
    r.y += r.vy;
    const t = Math.min(1, r.age / (LEVEL4_PARAMS.FIREBALL_FLIGHT_SEC * 60));
    r.r = LEVEL4_PARAMS.FIREBALL_START_R + (LEVEL4_PARAMS.FIREBALL_END_R - LEVEL4_PARAMS.FIREBALL_START_R) * t;
  }
  s.rocks = s.rocks.filter(r => r.age < r.ttl && r.y < CANVAS_H + 20);
}

// ── Player ──────────────────────────────────────────────────
function tickPlayer(s: L4State, input: L4Input) {
  const p = s.player;
  // Climbing detection: find nearest usable sprout under reach
  let nearLadder: L4Ladder | null = null;
  let nearIdx = -1;
  for (let i = 0; i < s.ladders.length; i++) {
    const l = s.ladders[i];
    const sp = s.sprouts[i];
    if (!sp.grown && !sp.isTop) continue;
    if (sp.isTop && !s.purpleSeedPlanted) continue;
    if (sp.isTop && sp.growProgress < 0.95) {
      // not yet fully grown
    }
    const cx = p.x + p.w / 2;
    if (Math.abs(cx - (l.x + 7)) < 12 && p.y + p.h >= l.yTop - 4 && p.y <= l.yBot + 20) {
      if (!nearLadder || Math.abs(cx - (l.x + 7)) < Math.abs(cx - (nearLadder.x + 7))) {
        nearLadder = l; nearIdx = i;
      }
    }
  }
  // Start climbing
  if (nearLadder && (input.up || input.down) && !p.climbing) {
    p.climbing = true;
    p.x = nearLadder.x;
    p.vy = 0;
  }
  if (p.climbing) {
    if (!nearLadder) p.climbing = false;
    else {
      const sp = s.sprouts[nearIdx];
      sp.inUse = true;
      const reach = sp.isTop ? nearLadder.yBot - (nearLadder.yBot - nearLadder.yTop) * sp.growProgress : nearLadder.yTop;
      if (input.up) p.y -= CLIMB_SPEED;
      else if (input.down) p.y += CLIMB_SPEED;
      // Snap x to ladder
      p.x = nearLadder.x;
      p.vy = 0;
      p.onGround = false;
      p.jumping = false;
      p.climbTimer++;
      if (p.climbTimer >= 8) { p.climbTimer = 0; p.climbFrame = (p.climbFrame + 1) % 2; }
      // Reach top → stand on platform
      if (sp.isTop) {
        if (p.y + p.h <= reach + 4) {
          p.y = L4_PLATFORMS[5].y - p.h;
          p.climbing = false;
          p.onGround = true;
          // Reached princess platform → check win
        }
      } else {
        if (p.y + p.h <= nearLadder.yTop + 2) {
          p.y = nearLadder.yTop - p.h;
          p.climbing = false;
          p.onGround = true;
        }
      }
      if (p.y + p.h >= nearLadder.yBot + 2) {
        p.y = nearLadder.yBot - p.h;
        p.climbing = false;
        p.onGround = true;
      }
      return;
    }
  }
  // Horizontal
  if (input.left) { p.vx = -MOVE_SPEED; p.facing = -1; }
  else if (input.right) { p.vx = MOVE_SPEED; p.facing = 1; }
  else p.vx = 0;
  // Jump
  if (input.jump && p.onGround) {
    p.vy = JUMP_FORCE;
    p.onGround = false;
    p.jumping = true;
    p.jumpFrame = 0; p.jumpTimer = 0;
  }
  // Gravity
  p.vy += GRAVITY;
  p.x += p.vx;
  p.y += p.vy;
  // Bounds
  p.x = Math.max(0, Math.min(CANVAS_W - p.w, p.x));
  // Platform collisions (top-only landing)
  p.onGround = false;
  for (const plat of L4_PLATFORMS) {
    if (p.x + p.w < plat.x1 || p.x > plat.x2) continue;
    const wasAbove = (p.y + p.h - p.vy) <= plat.y + 1;
    if (wasAbove && p.y + p.h >= plat.y && p.y + p.h <= plat.y + 12 && p.vy >= 0) {
      p.y = plat.y - p.h;
      p.vy = 0;
      p.onGround = true;
      p.jumping = false;
      break;
    }
  }
  // Animations
  if (p.onGround && Math.abs(p.vx) > 0.1) {
    p.walkTimer++;
    if (p.walkTimer >= 6) { p.walkTimer = 0; p.walkFrame = (p.walkFrame + 1) % 4; }
  } else p.walkFrame = 0;
  if (p.jumping) {
    p.jumpTimer++;
    if (p.jumpTimer >= 8) { p.jumpTimer = 0; p.jumpFrame = Math.min(2, p.jumpFrame + 1); }
  }
}

// ── Purple can / seed ───────────────────────────────────────
function tickPurpleCan(s: L4State) {
  if (!s.purpleCan || s.purpleCan.picked) return;
  const p = s.player;
  if (Math.abs((p.x + p.w / 2) - (s.purpleCan.x + 7)) < 16 && Math.abs((p.y + p.h) - (s.purpleCan.y + 14)) < 24) {
    s.purpleCan.picked = true;
    s.purpleCan.visible = false;
    s.hasPurpleCan = true;
  }
}

// ── Collisions ──────────────────────────────────────────────
function tickCollisions(s: L4State) {
  const p = s.player;
  // Hearts pickup
  for (const h of s.hearts) {
    if (h.x > p.x - 4 && h.x < p.x + p.w + 4 && h.y > p.y - 4 && h.y < p.y + p.h + 4) {
      h.landed = true;
      h.x = -9999; // remove
      if (!s.meterFull && s.dragon.state === 'walk') {
        s.heartMeter++;
        if (s.heartMeter >= s.diff.heartsToFill) s.meterFull = true;
      }
    }
  }
  s.hearts = s.hearts.filter(h => h.x > -100);

  // Dragon collision
  const d = s.dragon;
  if (d.state !== 'dead' && d.state !== 'dying' && d.state !== 'birdStun' && s.invuln <= 0) {
    const dw = DRAGON_W * d.scale, dh = DRAGON_H * d.scale;
    const overlap = p.x < d.x + dw && p.x + p.w > d.x && p.y < d.y + dh && p.y + p.h > d.y;
    if (overlap) {
      if (d.state === 'shrunk') {
        // Stomp check: player's feet must be above dragon top, moving downward
        if (p.vy > 0 && (p.y + p.h) < d.y + dh * 0.4) {
          d.state = 'birdStun';
          d.stunTimer = Math.round(LEVEL4_PARAMS.BIRD_STUN_SEC * 60);
          d.hits++;
          s.birdSpin = 0;
          p.vy = JUMP_FORCE * 0.8; // bounce
        } else {
          loseLife(s);
        }
      } else {
        loseLife(s);
      }
    }
  }

  // Rocks
  for (const r of s.rocks) {
    const dx = (p.x + p.w / 2) - r.x;
    const dy = (p.y + p.h / 2) - r.y;
    if (dx * dx + dy * dy < (r.r + 8) * (r.r + 8) && s.invuln <= 0) loseLife(s);
  }

  // Monkeys
  for (const m of s.monkeys) {
    if (!m.alive) continue;
    if (p.x < m.x + 16 && p.x + p.w > m.x && p.y < m.y + 24 && p.y + p.h > m.y) {
      // Stomp monkey if falling onto head
      if (p.vy > 0 && (p.y + p.h) < m.y + 12) {
        m.alive = false;
        m.respawnTimer = Math.round((LEVEL4_PARAMS.MONKEY_RESPAWN_MIN_SEC + Math.random() * (LEVEL4_PARAMS.MONKEY_RESPAWN_MAX_SEC - LEVEL4_PARAMS.MONKEY_RESPAWN_MIN_SEC)) * 60);
        p.vy = JUMP_FORCE * 0.8;
      } else if (s.invuln <= 0) {
        loseLife(s);
      }
    }
  }

  // Top-platform purple plant trigger
  if (s.hasPurpleCan && !s.purpleSeedPlanted) {
    const cx = p.x + p.w / 2;
    const topY = L4_PLATFORMS[4].y;
    if (Math.abs(p.y + p.h - topY) < 4) {
      const lp = s.ladders[s.purpleLadderIdx];
      if (Math.abs(cx - lp.x) < 24) {
        s.purpleSeedPlanted = true;
        const sp = s.sprouts[s.purpleLadderIdx];
        sp.phase = 'grow';
        sp.growProgress = 0;
        sp.growFrames = rollGrow();
        sp.watered = true;
      }
    }
  }

  // Win check: caveman touches princess on top platform
  if (Math.abs(p.y + p.h - L4_PLATFORMS[5].y) < 4) {
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
  s.died = true;
}

// ── Ending cinematic ────────────────────────────────────────
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

  // Sprouts
  for (let i = 0; i < s.ladders.length; i++) {
    const l = s.ladders[i];
    const sp = s.sprouts[i];
    if (sp.growProgress <= 0 && !sp.isTop) continue;
    const fullLen = l.yBot - l.yTop;
    const len = sp.isTop ? fullLen * sp.growProgress : fullLen * sp.growProgress;
    const top = sp.isTop ? l.yBot - len : l.yTop;
    const bot = sp.isTop ? l.yBot : l.yTop + len;
    ctx.fillStyle = sp.isTop ? '#9b59b6' : '#2ecc71';
    ctx.fillRect(l.x, top, 2, bot - top);
    ctx.fillRect(l.x + 12, top, 2, bot - top);
    // Rungs
    ctx.fillStyle = sp.isTop ? '#bb6cd9' : '#27ae60';
    for (let y = top + 8; y < bot; y += 10) ctx.fillRect(l.x, y, 14, 2);
  }

  // Princess
  if (sprites.princess.complete) {
    ctx.drawImage(sprites.princess, 0, 0, sprites.princess.width / 5, sprites.princess.height, s.princessX, s.princessY, PRINCESS_W, PRINCESS_H);
  } else {
    ctx.fillStyle = '#ff80c0'; ctx.fillRect(s.princessX, s.princessY, PRINCESS_W, PRINCESS_H);
  }

  // Volcano
  ctx.fillStyle = '#1e3a3a';
  ctx.beginPath();
  ctx.moveTo(s.volcanoX - 20, L4_PLATFORMS[5].y);
  ctx.lineTo(s.volcanoX + 20, L4_PLATFORMS[5].y);
  ctx.lineTo(s.volcanoX + 12, L4_PLATFORMS[5].y - 28);
  ctx.lineTo(s.volcanoX - 12, L4_PLATFORMS[5].y - 28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff5500';
  ctx.fillRect(s.volcanoX - 8, L4_PLATFORMS[5].y - 30, 16, 4);

  // Dragon
  const d = s.dragon;
  if (d.state !== 'dead') {
    const dw = DRAGON_W * d.scale, dh = DRAGON_H * d.scale;
    ctx.save();
    if (d.state === 'birdStun' || d.state === 'dying') ctx.globalAlpha = 0.85;
    if (d.flashOn) {
      ctx.fillStyle = d.flashColor === 'g' ? '#39ff14' : '#bb33ff';
      ctx.fillRect(d.x - 2, d.y - 2, dw + 4, dh + 4);
    }
    const img = sprites.dragonFire;
    if (img.complete) {
      const fw = img.width / 5;
      if (d.facing < 0) {
        ctx.translate(d.x + dw, d.y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, fw, img.height, 0, 0, dw, dh);
      } else {
        ctx.drawImage(img, 0, 0, fw, img.height, d.x, d.y, dw, dh);
      }
    } else {
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(d.x, d.y, dw, dh);
    }
    ctx.restore();
    // Bird stun overlay
    if (d.state === 'birdStun') {
      ctx.save();
      ctx.translate(d.x + dw / 2, d.y - 8);
      for (let i = 0; i < 3; i++) {
        const a = s.birdSpin + (i * Math.PI * 2 / 3);
        const bx = Math.cos(a) * 14, by = Math.sin(a) * 6;
        ctx.fillStyle = '#ffeb3b';
        ctx.font = '12px sans-serif';
        ctx.fillText('★', bx - 4, by + 4);
      }
      ctx.restore();
    }
  }

  // Monkeys
  for (const m of s.monkeys) {
    if (!m.alive) continue;
    const img = sprites.robotWalk;
    if (img.complete) {
      const fw = img.width / 5;
      ctx.save();
      if (m.facing < 0) {
        ctx.translate(m.x + 16, m.y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, m.walkFrame * fw, 0, fw, img.height, 0, 0, 16, 24);
      } else {
        ctx.drawImage(img, m.walkFrame * fw, 0, fw, img.height, m.x, m.y, 16, 24);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = '#9b59b6';
      ctx.fillRect(m.x, m.y, 16, 24);
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
      ctx.fillStyle = '#ff6633';
      ctx.beginPath(); ctx.arc(0, 0, r.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Hearts (falling)
  for (const h of s.hearts) {
    if (h.x < -50) continue;
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.rot);
    if (sprites.heart.complete) {
      ctx.drawImage(sprites.heart, -8, -8, 16, 16);
    } else {
      ctx.fillStyle = '#ff2030';
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Purple can
  if (s.purpleCan && s.purpleCan.visible) {
    if (sprites.wateringCan.complete) {
      ctx.save();
      // Tint via overlay
      ctx.drawImage(sprites.wateringCan, s.purpleCan.x - 2, s.purpleCan.y, 18, 14);
      ctx.fillStyle = 'rgba(155,89,182,0.55)';
      ctx.fillRect(s.purpleCan.x - 2, s.purpleCan.y, 18, 14);
      ctx.restore();
    } else {
      ctx.fillStyle = '#9b59b6';
      ctx.fillRect(s.purpleCan.x - 2, s.purpleCan.y, 18, 14);
    }
  }

  // Player
  const p = s.player;
  const blink = s.invuln > 0 && (s.invuln % 8 < 4);
  if (!blink) {
    let img: HTMLImageElement = sprites.cavemanWalk;
    let frame = p.walkFrame;
    let frames = 4;
    if (p.climbing) { img = sprites.cavemanClimb; frame = p.climbFrame; frames = 2; }
    else if (p.jumping) { img = sprites.cavemanJump; frame = p.jumpFrame; frames = 3; }
    if (img.complete) {
      const fw = img.width / frames;
      ctx.save();
      if (p.facing < 0) {
        ctx.translate(p.x + p.w, p.y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, frame * fw, 0, fw, img.height, 0, 0, p.w, p.h);
      } else {
        ctx.drawImage(img, frame * fw, 0, fw, img.height, p.x, p.y, p.w, p.h);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = '#deb887';
      ctx.fillRect(p.x, p.y, p.w, p.h);
    }
  }

  // HUD: heart meter (bottom-left) with purple slots
  const slots = s.diff.heartsToFill;
  const slotW = 18, slotH = 14, slotY = CANVAS_H - 22, slotX0 = 28;
  if (sprites.heart.complete) {
    ctx.drawImage(sprites.heart, 4, slotY - 1, 18, 18);
  }
  // Purple slots: each filled (boxes remaining) = hitsToKill - dragon.hits
  const totalBoxes = s.diff.hitsToKill;
  const remainingBoxes = Math.max(0, totalBoxes - s.dragon.hits);
  for (let i = 0; i < totalBoxes; i++) {
    const filled = i < remainingBoxes;
    ctx.fillStyle = filled ? '#9b59b6' : '#2c2c2c';
    ctx.fillRect(slotX0 + i * (slotW + 4), slotY, slotW, slotH);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(slotX0 + i * (slotW + 4), slotY, slotW, slotH);
  }
  // Heart meter pips (over the heart icon, small dots showing fill progress)
  for (let i = 0; i < slots; i++) {
    ctx.fillStyle = i < s.heartMeter ? '#ff3344' : '#440011';
    ctx.beginPath();
    ctx.arc(slotX0 + (totalBoxes) * (slotW + 4) + 10 + i * 9, slotY + slotH / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ending overlay
  if (s.ending.active) {
    const e = s.ending;
    if (e.phase === 'hug' || e.phase === 'pause') {
      // Show princess + caveman together with bubble
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(140, 60, 180, 36);
      ctx.fillStyle = '#000';
      ctx.font = '14px sans-serif';
      ctx.fillText('Thank you, my hero!', 158, 84);
    }
    if (e.phase === 'kidnap') {
      // New dragon flying in to grab princess
      const img = sprites.dragonAngry;
      if (img.complete) {
        const fw = img.width / 5;
        ctx.drawImage(img, 0, 0, fw, img.height, e.newDragonX, s.princessY - 4, DRAGON_W, DRAGON_H);
      } else {
        ctx.fillStyle = '#700';
        ctx.fillRect(e.newDragonX, s.princessY, DRAGON_W, DRAGON_H);
      }
    }
  }

  ctx.restore();
}
