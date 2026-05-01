// ============================================================
// Level 2 — layout swap
// ------------------------------------------------------------
// Mutates the shared PLATFORMS / LADDERS arrays from constants
// to a Level-2 layout (flat platforms + sprout vines), and can
// restore the original Level 1 layout.
//
// Why mutate-in-place: the host references PLATFORMS/LADDERS
// directly in many tight loops (player physics, monkey AI,
// barrel routing). Swapping references everywhere would be a
// large refactor; mutating contents keeps Level 1 code paths
// untouched while Level 2 is active.
//
// Sprout rules (per user spec):
//   • All gaps from P1→P2 up through P4→P5 get 1–2 sprouts
//     placed at random horizontal positions on their base
//     platform (left, center, or right area).
//   • The topmost gap (P5→P6) keeps its single ladder slot at
//     the existing TOP_VINE_IDX position so the existing
//     "water the seed → vine grows" mechanic still works.
//   • Sprouts (excluding the topmost) start GROWN. After being
//     used (climbed up or down) they wither for 2–5s, then
//     regrow.
// ============================================================

import { PLATFORMS, LADDERS } from '../constants';
import { LEVEL2_PARAMS } from './params';

// Snapshot of the original L1 layout (filled lazily on first call).
let l1PlatformsBackup: typeof PLATFORMS | null = null;
let l1LaddersBackup: typeof LADDERS | null = null;

/** Index into LADDERS that is the topmost (P5 → P6). Always last. */
export let TOP_LADDER_IDX_L2 = 0;

/** Per-ladder runtime sprout state, parallel to LADDERS[]. */
/** Lifecycle of a non-top sprout in L2:
 *   'idle'    — fully grown & climbable.
 *   'wither'  — vine shrinking back toward the seed (growProgress 1→0).
 *   'dormant' — only the seed mound is visible; regrowTimer counting down.
 *   'grow'    — vine animating back up from seed (growProgress 0→1).
 *
 * Only 'idle' sprouts are climbable.
 */
export type SproutPhase = 'idle' | 'wither' | 'dormant' | 'grow';

export interface SproutRuntime {
  /** Index of this ladder/sprout in the LADDERS array. */
  ladderIdx: number;
  /** Currently usable (climb/render) when true. */
  grown: boolean;
  /** Frames remaining until grow phase starts (when phase==='dormant'). */
  regrowTimer: number;
  /** Visible vine length, 0..1. 1 = full height (idle), 0 = no vine (dormant). */
  growProgress: number;
  /** Lifecycle phase — drives both physics (`grown`) and the renderer. */
  phase: SproutPhase;
  /** True for the topmost (P5→P6) — managed by the existing
   *  watering mechanic, not by the regrow timer. */
  isTop: boolean;
}

let sproutsRuntime: SproutRuntime[] = [];

/** Frames the grow / wither animation takes (~1.13s @60fps — matches L1
 *  top-vine grow feel of 1/68 per frame). */
const GROW_FRAMES = 68;

export function getSprouts(): SproutRuntime[] { return sproutsRuntime; }

/** Returns true if this ladder index is currently usable in L2. */
export function isLadderUsableL2(idx: number): boolean {
  const s = sproutsRuntime[idx];
  return !!s && s.grown;
}

/** Mark a sprout as just-used; kicks off the wither animation. No-op for top. */
export function markSproutUsed(idx: number): void {
  const s = sproutsRuntime[idx];
  if (!s || s.isTop || s.phase !== 'idle') return;
  s.grown = false;          // immediately not climbable
  s.phase = 'wither';
  // growProgress stays at 1 and will tick down to 0.
}

/** Tick all sprout regrow timers + grow/wither animation. Call once per frame. */
export function tickSprouts(): void {
  for (const s of sproutsRuntime) {
    if (s.isTop) continue;
    switch (s.phase) {
      case 'idle': break;
      case 'wither':
        s.growProgress = Math.max(0, s.growProgress - 1 / GROW_FRAMES);
        if (s.growProgress <= 0) {
          s.growProgress = 0;
          s.phase = 'dormant';
          const min = LEVEL2_PARAMS.SPROUT_REGROW_MIN_SEC * 60;
          const max = LEVEL2_PARAMS.SPROUT_REGROW_MAX_SEC * 60;
          s.regrowTimer = Math.round(min + Math.random() * (max - min));
        }
        break;
      case 'dormant':
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

/** Apply the L2 layout: flatten platforms + rebuild ladders/sprouts. */
export function applyLevel2Layout(rng: () => number = Math.random): void {
  backupLayoutOnce();

  // 1) Flatten every platform (slope = 0).
  for (const p of PLATFORMS) p.slope = 0;

  // 2) Rebuild LADDERS array contents in-place.
  const newLadders: { x: number; yTop: number; yBot: number }[] = [];

  // Helper: random x within the platform's middle band, avoiding edges.
  const pickX = (platIdx: number, slot: 'left' | 'center' | 'right'): number => {
    const plat = PLATFORMS[platIdx];
    const margin = 24;
    const usableL = plat.x1 + margin;
    const usableR = plat.x2 - margin - 14; // ladder is 14 wide
    const span = usableR - usableL;
    if (span <= 0) return Math.max(plat.x1, Math.min(plat.x2 - 14, (plat.x1 + plat.x2) / 2 - 7));
    if (slot === 'left')   return usableL + rng() * (span * 0.3);
    if (slot === 'right')  return usableL + span * 0.7 + rng() * (span * 0.3);
    /* center */           return usableL + span * 0.35 + rng() * (span * 0.3);
  };

  // Gaps P1→P2 (base 0 → top 1) ... P4→P5 (base 3 → top 4)
  for (let baseIdx = 0; baseIdx < 4; baseIdx++) {
    const topIdx = baseIdx + 1;
    const minS = LEVEL2_PARAMS.SPROUTS_PER_GAP_MIN;
    const maxS = LEVEL2_PARAMS.SPROUTS_PER_GAP_MAX;
    const count = minS + Math.floor(rng() * (maxS - minS + 1));
    // Pick distinct slot positions
    const slotPool: ('left' | 'center' | 'right')[] = ['left', 'center', 'right'];
    // Shuffle
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

  // Topmost gap P5→P6: keep a single sprout slot at the original
  // TOP_VINE_IDX position so the existing watering mechanic works.
  const origTop = (l1LaddersBackup && l1LaddersBackup[l1LaddersBackup.length - 1])
    || { x: 350, yTop: 112, yBot: 176 };
  newLadders.push({ x: origTop.x, yTop: origTop.yTop, yBot: origTop.yBot });

  // Mutate LADDERS in place.
  LADDERS.length = 0;
  for (const l of newLadders) LADDERS.push(l);
  TOP_LADDER_IDX_L2 = LADDERS.length - 1;

  // 3) Build per-sprout runtime state. All non-top start GROWN.
  sproutsRuntime = LADDERS.map((_l, i) => ({
    ladderIdx: i,
    grown: true,
    regrowTimer: 0,
    growProgress: 1,
    phase: 'idle' as SproutPhase,
    isTop: i === TOP_LADDER_IDX_L2,
  }));
}

/** Restore the original L1 layout. Safe to call even if never applied. */
export function restoreLevel1Layout(): void {
  if (!l1PlatformsBackup || !l1LaddersBackup) return;
  for (let i = 0; i < PLATFORMS.length; i++) {
    Object.assign(PLATFORMS[i], l1PlatformsBackup[i]);
  }
  LADDERS.length = 0;
  for (const l of l1LaddersBackup) LADDERS.push({ ...l });
  sproutsRuntime = [];
}
