// ============================================================
// Level 2 — layout swap
// ------------------------------------------------------------
// Mutates the shared PLATFORMS / LADDERS arrays from constants
// to a Level-2 layout. Sprout vines on every gap, plus two
// special TOP-vine sprouts (green = volcano side, purple =
// dragon side). The top platform is visually split by a
// permanent hole in the middle (handled by the L2 hole system).
// ============================================================

import { PLATFORMS, LADDERS, CANVAS_W } from '../constants';
import { LEVEL2_PARAMS, getCurrentLevel2Difficulty } from './params';

let l1PlatformsBackup: typeof PLATFORMS | null = null;
let l1LaddersBackup: typeof LADDERS | null = null;

/** Last index of LADDERS — kept for backwards-compat. In L2 the host
 *  treats this as “nothing special”; both top sprouts are normal L2
 *  ladders managed by sproutsRuntime[]. */
export let TOP_LADDER_IDX_L2 = 0;

/** Index of the GREEN top-side sprout (water with green can to reach volcano). */
export let GREEN_TOP_LADDER_IDX = -1;
/** Index of the PURPLE top-side sprout (water with purple can to reach princess). */
export let PURPLE_TOP_LADDER_IDX = -1;

/** X-bounds of the permanent gap in the top platform. */
export let TOP_GAP_X1 = 0;
export let TOP_GAP_X2 = 0;

export type SproutPhase = 'idle' | 'wither' | 'dormant' | 'grow';

export interface SproutRuntime {
  ladderIdx: number;
  grown: boolean;
  regrowTimer: number;
  growProgress: number;
  phase: SproutPhase;
  /** True for the two TOP sprouts (green/purple) — they are seed-only
   *  until watered with the matching can; never auto-regrow. */
  isTop: boolean;
  /** For top sprouts: which color watering can grows it. */
  topColor?: 'green' | 'purple';
  /** True once watered; growth animation runs. */
  watered?: boolean;
  /** Frames remaining at full grown state before auto-wither (non-top only).
   *  Frozen while inUse is true. */
  aliveTimer?: number;
  /** Set per-frame by host: true while a player is actively climbing this sprout.
   *  Auto-clears each frame; host re-asserts. */
  inUse?: boolean;
  /** Which platform-gap this sprout belongs to (0..3). -1 for top sprouts. */
  gapIdx: number;
}

let sproutsRuntime: SproutRuntime[] = [];

const GROW_FRAMES = 68;

function rollAliveFrames(): number {
  const d = getCurrentLevel2Difficulty();
  return Math.round((d.sproutAliveMinSec + Math.random() * (d.sproutAliveMaxSec - d.sproutAliveMinSec)) * 60);
}

export function getSprouts(): SproutRuntime[] { return sproutsRuntime; }

export function isLadderUsableL2(idx: number): boolean {
  const s = sproutsRuntime[idx];
  return !!s && s.grown;
}

/** Host calls this each frame for the sprout currently being climbed (if any). */
export function markSproutInUse(idx: number): void {
  const s = sproutsRuntime[idx];
  if (s) s.inUse = true;
}

/** Mark a (non-top) sprout as just-used; kicks off the wither animation. */
export function markSproutUsed(idx: number): void {
  const s = sproutsRuntime[idx];
  if (!s || s.isTop || s.phase !== 'idle') return;
  // Never wither if it would leave the gap with zero grown sprouts.
  if (grownInGap(s.gapIdx, idx) === 0) return;
  s.grown = false;
  s.phase = 'wither';
}

/** Water a top sprout. Returns true if successful. */
export function waterTopSprout(color: 'green' | 'purple'): boolean {
  const idx = color === 'green' ? GREEN_TOP_LADDER_IDX : PURPLE_TOP_LADDER_IDX;
  if (idx < 0) return false;
  const s = sproutsRuntime[idx];
  if (!s || s.watered) return false;
  s.watered = true;
  s.phase = 'grow';
  s.growProgress = 0;
  return true;
}

/** Has the given top sprout been watered (and thus growing or grown)? */
export function isTopSproutGrown(color: 'green' | 'purple'): boolean {
  const idx = color === 'green' ? GREEN_TOP_LADDER_IDX : PURPLE_TOP_LADDER_IDX;
  if (idx < 0) return false;
  const s = sproutsRuntime[idx];
  return !!(s && s.grown);
}

/** Count currently-grown sprouts in a given gap (excluding `excludeIdx`). */
function grownInGap(gapIdx: number, excludeIdx = -1): number {
  let n = 0;
  for (let i = 0; i < sproutsRuntime.length; i++) {
    if (i === excludeIdx) continue;
    const s = sproutsRuntime[i];
    if (s.isTop) continue;
    if (s.gapIdx === gapIdx && s.grown) n++;
  }
  return n;
}

export function tickSprouts(): void {
  for (let idx = 0; idx < sproutsRuntime.length; idx++) {
    const s = sproutsRuntime[idx];
    switch (s.phase) {
      case 'idle':
        // Non-top sprouts auto-wither after their alive window, unless being climbed.
        if (!s.isTop) {
          if (s.aliveTimer === undefined) s.aliveTimer = rollAliveFrames();
          if (!s.inUse) {
            s.aliveTimer--;
            if (s.aliveTimer <= 0) {
              // Guarantee at least 1 grown sprout per gap at all times.
              if (grownInGap(s.gapIdx, idx) === 0) {
                // Refresh and stay alive — don't leave the gap empty.
                s.aliveTimer = rollAliveFrames();
              } else {
                s.grown = false;
                s.phase = 'wither';
                s.aliveTimer = undefined;
              }
            }
          }
        }
        break;
      case 'wither':
        s.growProgress = Math.max(0, s.growProgress - 1 / GROW_FRAMES);
        if (s.growProgress <= 0) {
          s.growProgress = 0;
          if (s.isTop) {
            // top sprouts don't regrow automatically
            s.phase = 'dormant';
            s.regrowTimer = -1;
          } else {
            s.phase = 'dormant';
            const d = getCurrentLevel2Difficulty();
            const min = d.sproutRegrowMinSec * 60;
            const max = d.sproutRegrowMaxSec * 60;
            s.regrowTimer = Math.round(min + Math.random() * (max - min));
          }
        }
        break;
      case 'dormant':
        if (s.isTop) break; // top sprouts only grow when watered
        s.regrowTimer--;
        // If this sprout's gap currently has 0 alive sprouts, fast-track
        // regrow so the player is never stranded.
        if (grownInGap(s.gapIdx, idx) === 0 && s.regrowTimer > 0) {
          s.regrowTimer = 0;
        }
        if (s.regrowTimer <= 0) { s.regrowTimer = 0; s.phase = 'grow'; }
        break;
      case 'grow':
        s.growProgress = Math.min(1, s.growProgress + 1 / GROW_FRAMES);
        if (s.growProgress >= 1) {
          s.growProgress = 1;
          s.phase = 'idle';
          s.grown = true;
          if (!s.isTop) s.aliveTimer = rollAliveFrames();
        }
        break;
    }
    // Clear per-frame in-use flag; host re-asserts each frame while climbing.
    s.inUse = false;
  }
}

function backupLayoutOnce(): void {
  if (l1PlatformsBackup) return;
  l1PlatformsBackup = PLATFORMS.map(p => ({ ...p }));
  l1LaddersBackup = LADDERS.map(l => ({ ...l }));
}

export function applyLevel2Layout(rng: () => number = Math.random): void {
  backupLayoutOnce();

  // 1) Flatten every platform.
  for (const p of PLATFORMS) p.slope = 0;

  // 1b) Guarantee every platform anchors to one screen edge so the player
  // can never fall through an interior gap. Even-indexed platforms (P1,
  // P3, P5) touch the LEFT edge; odd-indexed (P2, P4) touch the RIGHT
  // edge. The top platform (P6) spans both edges so the volcano sits on
  // it with empty space to its right (green-sprout climb path).
  for (let i = 0; i < PLATFORMS.length; i++) {
    const p = PLATFORMS[i];
    if (i === PLATFORMS.length - 1) {
      p.x1 = 0;
      p.x2 = CANVAS_W;
    } else if (i % 2 === 0) {
      p.x1 = 0; // left-anchored
    } else {
      p.x2 = CANVAS_W; // right-anchored
    }
  }
  const topPlat = PLATFORMS[PLATFORMS.length - 1];

  // 2) Compute the permanent gap on the top platform (P6 = last).
  const gapW = LEVEL2_PARAMS.TOP_GAP_WIDTH;
  // Dragon/princess sit around x=70..215 on the left half. Place the gap
  // safely right of the princess but left of the volcano so the player can
  // still cross to the dragon side.
  const gapCX = 270;
  TOP_GAP_X1 = Math.round(gapCX - gapW / 2);
  TOP_GAP_X2 = Math.round(gapCX + gapW / 2);

  // 3) Rebuild LADDERS array contents in-place.
  const newLadders: { x: number; yTop: number; yBot: number }[] = [];

  const pickX = (platIdx: number, slot: 'left' | 'center' | 'right'): number => {
    const plat = PLATFORMS[platIdx];
    // Keep sprouts well inside the platform — never at the edge — so the
    // player has solid ground on both sides to land on after climbing.
    const EDGE_MARGIN = 40;
    const usableL = plat.x1 + EDGE_MARGIN;
    const usableR = plat.x2 - EDGE_MARGIN - 14;
    const span = usableR - usableL;
    if (span <= 0) return Math.max(plat.x1 + EDGE_MARGIN, Math.min(plat.x2 - EDGE_MARGIN - 14, (plat.x1 + plat.x2) / 2 - 7));
    if (slot === 'left')   return usableL + rng() * (span * 0.3);
    if (slot === 'right')  return usableL + span * 0.7 + rng() * (span * 0.3);
    return usableL + span * 0.35 + rng() * (span * 0.3);
  };

  // Gaps P1→P2 ... P4→P5: EXACTLY 2 sprouts per gap — one on the LEFT
  // half, one on the RIGHT half. Keep each sprout WELL-separated from
  // sprouts in the gap directly below (whose tops emerge on the same
  // platform that this gap's bases sit on) so vines never appear stacked.
  const MIN_VERT_SEP_PX = 110;
  const ladderGapIdx: number[] = []; // parallel to newLadders
  const xsByGap: number[][] = [];
  for (let baseIdx = 0; baseIdx < 4; baseIdx++) {
    const topIdx = baseIdx + 1;
    const belowXs = baseIdx > 0 ? xsByGap[baseIdx - 1] : [];
    const minDistFromBelow = (x: number) =>
      belowXs.length === 0 ? Infinity : Math.min(...belowXs.map(bx => Math.abs(x - bx)));

    const slots: ('left' | 'right')[] = ['left', 'right'];
    const xs: number[] = [];
    for (const slot of slots) {
      // Try many candidates and keep the one farthest from any sprout
      // directly below — guarantees maximum spread even if the slot
      // range is tight.
      let bestX = pickX(baseIdx, slot);
      let bestDist = minDistFromBelow(bestX);
      for (let attempt = 0; attempt < 40; attempt++) {
        const cand = pickX(baseIdx, slot);
        const d = minDistFromBelow(cand);
        if (d > bestDist) { bestDist = d; bestX = cand; }
        if (bestDist >= MIN_VERT_SEP_PX) break;
      }
      xs.push(bestX);
      const yBot = PLATFORMS[baseIdx].y;
      const yTop = PLATFORMS[topIdx].y;
      newLadders.push({ x: bestX, yTop, yBot });
      ladderGapIdx.push(baseIdx);
    }
    xsByGap.push(xs);
  }

  // P5 → Top: TWO sprouts. Purple (dragon side, just RIGHT of princess) and
  // Green (volcano side, right). Princess sits at x≈175 with width 40, so
  // her right edge is ≈215. Place purple just to the right of her, but still
  // left of the permanent top-platform gap (so it leads to the dragon side).
  const p5 = PLATFORMS[4];
  const yBotTop = p5.y;
  const yTopTop = topPlat.y;
  const TOP_EDGE = 40;
  const purpleTargetX = 230; // just right of princess (right edge ≈215)
  const purpleMaxX = TOP_GAP_X1 - 18; // stay on dragon side of top gap
  const purpleX = Math.max(p5.x1 + TOP_EDGE, Math.min(p5.x2 - TOP_EDGE, Math.min(purpleTargetX, purpleMaxX)));
  // Green sits to the right of the volcano (volcano center = top.x2 - 95,
  // right edge ≈ top.x2 - 50). Place green at top.x2 - 40 so it's clearly
  // beside (not under) the volcano while still respecting the edge margin.
  const greenIdeal = topPlat.x2 - TOP_EDGE;
  const greenX = Math.max(p5.x1 + TOP_EDGE, Math.min(p5.x2 - TOP_EDGE, greenIdeal));

  newLadders.push({ x: purpleX, yTop: yTopTop, yBot: yBotTop });
  PURPLE_TOP_LADDER_IDX = newLadders.length - 1;
  newLadders.push({ x: greenX, yTop: yTopTop, yBot: yBotTop });
  GREEN_TOP_LADDER_IDX = newLadders.length - 1;

  LADDERS.length = 0;
  for (const l of newLadders) LADDERS.push(l);
  TOP_LADDER_IDX_L2 = LADDERS.length - 1;

  // 4) Sprout runtime — non-top start GROWN, top start as seeds.
  sproutsRuntime = LADDERS.map((_l, i) => {
    const isTop = i === GREEN_TOP_LADDER_IDX || i === PURPLE_TOP_LADDER_IDX;
    // For non-top sprouts, gap index was tracked per ladder during build.
    // Top sprouts don't belong to a regular gap (use -1).
    const gapIdx = isTop ? -1 : (ladderGapIdx[i] ?? -1);
    return {
      ladderIdx: i,
      grown: !isTop,
      regrowTimer: 0,
      growProgress: isTop ? 0 : 1,
      phase: (isTop ? 'dormant' : 'idle') as SproutPhase,
      isTop,
      topColor: i === GREEN_TOP_LADDER_IDX ? 'green' : i === PURPLE_TOP_LADDER_IDX ? 'purple' : undefined,
      watered: false,
      gapIdx,
    };
  });
}

export function restoreLevel1Layout(): void {
  if (!l1PlatformsBackup || !l1LaddersBackup) return;
  for (let i = 0; i < PLATFORMS.length; i++) {
    Object.assign(PLATFORMS[i], l1PlatformsBackup[i]);
  }
  LADDERS.length = 0;
  for (const l of l1LaddersBackup) LADDERS.push({ ...l });
  sproutsRuntime = [];
  GREEN_TOP_LADDER_IDX = -1;
  PURPLE_TOP_LADDER_IDX = -1;
  TOP_GAP_X1 = 0;
  TOP_GAP_X2 = 0;
}
