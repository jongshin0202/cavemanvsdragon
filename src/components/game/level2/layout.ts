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
import { LEVEL2_PARAMS } from './params';

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
const ALIVE_MIN_SEC = 3;
const ALIVE_MAX_SEC = 5;

function rollAliveFrames(): number {
  return Math.round((ALIVE_MIN_SEC + Math.random() * (ALIVE_MAX_SEC - ALIVE_MIN_SEC)) * 60);
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
            const min = LEVEL2_PARAMS.SPROUT_REGROW_MIN_SEC * 60;
            const max = LEVEL2_PARAMS.SPROUT_REGROW_MAX_SEC * 60;
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

  // 2) Compute the permanent gap on the top platform (P6 = last).
  const topPlat = PLATFORMS[PLATFORMS.length - 1];
  const gapW = LEVEL2_PARAMS.TOP_GAP_WIDTH;
  const gapCX = (topPlat.x1 + topPlat.x2) / 2 + 30; // shift slightly right so dragon side is wider
  TOP_GAP_X1 = Math.round(gapCX - gapW / 2);
  TOP_GAP_X2 = Math.round(gapCX + gapW / 2);

  // 3) Rebuild LADDERS array contents in-place.
  const newLadders: { x: number; yTop: number; yBot: number }[] = [];

  const pickX = (platIdx: number, slot: 'left' | 'center' | 'right'): number => {
    const plat = PLATFORMS[platIdx];
    const margin = 24;
    const usableL = plat.x1 + margin;
    const usableR = plat.x2 - margin - 14;
    const span = usableR - usableL;
    if (span <= 0) return Math.max(plat.x1, Math.min(plat.x2 - 14, (plat.x1 + plat.x2) / 2 - 7));
    if (slot === 'left')   return usableL + rng() * (span * 0.3);
    if (slot === 'right')  return usableL + span * 0.7 + rng() * (span * 0.3);
    return usableL + span * 0.35 + rng() * (span * 0.3);
  };

  // Gaps P1→P2 ... P4→P5 (regular sprouts). Track gap index per ladder.
  const ladderGapIdx: number[] = []; // parallel to newLadders
  for (let baseIdx = 0; baseIdx < 4; baseIdx++) {
    const topIdx = baseIdx + 1;
    const minS = LEVEL2_PARAMS.SPROUTS_PER_GAP_MIN;
    const maxS = LEVEL2_PARAMS.SPROUTS_PER_GAP_MAX;
    const count = Math.min(3, minS + Math.floor(rng() * (maxS - minS + 1)));
    // Slot pool ensures unique left/center/right placement (max 1 of each).
    const slotPool: ('left' | 'center' | 'right')[] = ['left', 'center', 'right'];
    for (let i = slotPool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [slotPool[i], slotPool[j]] = [slotPool[j], slotPool[i]];
    }
    for (let n = 0; n < count; n++) {
      const slot = slotPool[n];
      const x = pickX(baseIdx, slot);
      const yBot = PLATFORMS[baseIdx].y;
      const yTop = PLATFORMS[topIdx].y;
      newLadders.push({ x, yTop, yBot });
      ladderGapIdx.push(baseIdx);
    }
  }

  // P5 → Top: TWO sprouts. Purple (dragon side, left) and Green (volcano side, right).
  const p5 = PLATFORMS[4];
  const yBotTop = p5.y;
  const yTopTop = topPlat.y;
  // Place purple roughly under dragon area (left ~25% of canvas)
  const purpleX = Math.max(p5.x1 + 30, Math.min(p5.x2 - 44, 110));
  // Place green roughly under volcano (right ~80% of canvas)
  const greenX = Math.max(p5.x1 + 30, Math.min(p5.x2 - 44, CANVAS_W - 130));

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
