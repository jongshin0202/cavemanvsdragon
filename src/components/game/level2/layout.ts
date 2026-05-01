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
}

let sproutsRuntime: SproutRuntime[] = [];

const GROW_FRAMES = 68;

export function getSprouts(): SproutRuntime[] { return sproutsRuntime; }

export function isLadderUsableL2(idx: number): boolean {
  const s = sproutsRuntime[idx];
  return !!s && s.grown;
}

/** Mark a (non-top) sprout as just-used; kicks off the wither animation. */
export function markSproutUsed(idx: number): void {
  const s = sproutsRuntime[idx];
  if (!s || s.isTop || s.phase !== 'idle') return;
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

export function tickSprouts(): void {
  for (const s of sproutsRuntime) {
    switch (s.phase) {
      case 'idle': break;
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
        if (s.regrowTimer <= 0) { s.regrowTimer = 0; s.phase = 'grow'; }
        break;
      case 'grow':
        s.growProgress = Math.min(1, s.growProgress + 1 / GROW_FRAMES);
        if (s.growProgress >= 1) {
          s.growProgress = 1;
          s.phase = 'idle';
          s.grown = true;
        }
        break;
    }
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

  // Gaps P1→P2 ... P4→P5 (regular sprouts)
  for (let baseIdx = 0; baseIdx < 4; baseIdx++) {
    const topIdx = baseIdx + 1;
    const minS = LEVEL2_PARAMS.SPROUTS_PER_GAP_MIN;
    const maxS = LEVEL2_PARAMS.SPROUTS_PER_GAP_MAX;
    const count = minS + Math.floor(rng() * (maxS - minS + 1));
    const slotPool: ('left' | 'center' | 'right')[] = ['left', 'center', 'right'];
    for (let i = slotPool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [slotPool[i], slotPool[j]] = [slotPool[j], slotPool[i]];
    }
    for (let n = 0; n < count; n++) {
      const slot = slotPool[n % slotPool.length];
      const x = pickX(baseIdx, slot);
      const yBot = PLATFORMS[baseIdx].y;
      const yTop = PLATFORMS[topIdx].y;
      newLadders.push({ x, yTop, yBot });
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
    return {
      ladderIdx: i,
      grown: !isTop,
      regrowTimer: 0,
      growProgress: isTop ? 0 : 1,
      phase: (isTop ? 'dormant' : 'idle') as SproutPhase,
      isTop,
      topColor: i === GREEN_TOP_LADDER_IDX ? 'green' : i === PURPLE_TOP_LADDER_IDX ? 'purple' : undefined,
      watered: false,
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
