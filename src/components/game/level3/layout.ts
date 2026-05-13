// ============================================================
// Level 3 — Frogger-inspired layout
// ------------------------------------------------------------
// From top to bottom (matches the user's sketch):
//   P5  TOP     : dragon (L) + volcano (R) with permanent center gap
//                 (same as L2 — uses TOP_GAP_X1/X2)
//   P4  SPROUT  : long full-width sprout platform with 5 hanging vines
//                 plus a permanent center drop-gap so the player can fall
//                 down to the moving-platform area
//   P3  SPLIT   : 2-piece platform (left half + right half, permanent
//                 middle gap too wide to jump)
//   (rows of horizontally-moving platforms live BETWEEN P3 and P1 —
//   built by movingPlatforms.ts; not part of PLATFORMS[])
//   P1  FLOAT   : small floating platform near the bottom
//   P0  GROUND  : full-width ground
// ============================================================

import { PLATFORMS, LADDERS, CANVAS_W } from '../constants';
import {
  setSproutsRuntime, setTopGap, setTopLadderIndices, backupL1LayoutOnce,
  GREEN_TOP_LADDER_IDX as _g, PURPLE_TOP_LADDER_IDX as _p,
  type SproutRuntime,
} from '../level2/layout';
import { LEVEL2_PARAMS, setCurrentLevel2Iteration } from '../level2/params';

/** X-bounds of the permanent split in the 2-piece P3 platform. */
export let MID_SPLIT_X1 = 0;
export let MID_SPLIT_X2 = 0;
/** X-bounds of the permanent drop-hole in the sprout platform (P4). */
export let SPROUT_DROP_X1 = 0;
export let SPROUT_DROP_X2 = 0;
/** X-bounds of the small floating platform (P1) — exposed for fireball aim. */
export let FLOAT_X1 = 0;
export let FLOAT_X2 = 0;

export function applyLevel3Layout(): void {
  backupL1LayoutOnce();

  // Flatten everything.
  for (const p of PLATFORMS) p.slope = 0;

  // ── P0 (ground): no static ledge — the entire bottom row is moving
  //   platforms. Player falls into the gap and dies if missed.
  PLATFORMS[0].x1 = 0;        PLATFORMS[0].x2 = 0;         PLATFORMS[0].y = 432;
  // ── P5 (top): full width
  PLATFORMS[5].x1 = 0;        PLATFORMS[5].x2 = CANVAS_W; PLATFORMS[5].y = 112;

  // ── P4 long sprout platform — full width. Sits HIGH so the top "seed"
  //   region stays short (like L2) and the middle SPROUT-CLIMB region is
  //   tall (Donkey-Kong-Jr style: vertical traversal + lateral movement).
  PLATFORMS[4].x1 = 0;        PLATFORMS[4].x2 = CANVAS_W; PLATFORMS[4].y = 176;

  // ── P3 — REMOVED. No floor under the sprout section; the vines hang
  //   freely from P4 and the player drops into the moving-platform area
  //   if they fall off the bottom.
  PLATFORMS[3].x1 = 0;        PLATFORMS[3].x2 = 0;         PLATFORMS[3].y = 304;

  // ── P2 — unused (no right-edge ledge); the bottom row is fully moving.
  PLATFORMS[2].x1 = 0;        PLATFORMS[2].x2 = 0;         PLATFORMS[2].y = 432;

  // ── P1 unused — collapse (no static floating island in L3)
  FLOAT_X1 = 0; FLOAT_X2 = 0;
  PLATFORMS[1].x1 = 0; PLATFORMS[1].x2 = 0; PLATFORMS[1].y = 400;

  // ── Permanent gaps
  // Top platform split (between dragon side and volcano side)
  const topGapW = LEVEL2_PARAMS.TOP_GAP_WIDTH;
  const topGapCX = 270;
  setTopGap(Math.round(topGapCX - topGapW / 2), Math.round(topGapCX + topGapW / 2));

  // Sprout platform drop-hole (player can fall through to the moving area)
  SPROUT_DROP_X1 = 232; SPROUT_DROP_X2 = 280;

  // Mid split — wide enough to NOT be jumpable (~112px > max jump dist ~50px)
  MID_SPLIT_X1 = 200; MID_SPLIT_X2 = 312;

  // ── Build LADDERS: 5 vines hanging from the sprout platform (P4) down to
  //   P3 (left + right pieces). Spaced so the caveman can move between them.
  //   Plus the two top-platform vines (purple → dragon side, green → volcano).
  const newLadders: { x: number; yTop: number; yBot: number }[] = [];

  // Donkey-Kong-Jr style: densely-packed vines hanging from the CEILING
  // (P4) down to the same length as before. There is no floor under them
  // anymore — sprouts only require an anchor on P4 (skipping its drop-hole).
  const VINE_SPACING = 32;
  const VINE_MARGIN = 24;
  const candidateXs: number[] = [];
  let parity = 0;
  for (let x = VINE_MARGIN; x <= CANVAS_W - VINE_MARGIN; x += VINE_SPACING) {
    // Need anchor on P4 (skip sprout drop-hole)
    if (x >= SPROUT_DROP_X1 - 4 && x <= SPROUT_DROP_X2 + 4) continue;
    // Sparse pattern: sprout / no-sprout / sprout / no-sprout …
    if ((parity++ % 2) !== 0) continue;
    candidateXs.push(x);
  }
  const vineXs = candidateXs;
  const sproutLadderRange: { from: number; to: number } = { from: 0, to: 0 };
  sproutLadderRange.from = newLadders.length;
  for (const vx of vineXs) {
    newLadders.push({ x: vx, yTop: PLATFORMS[4].y, yBot: PLATFORMS[3].y });
  }
  sproutLadderRange.to = newLadders.length;

  // Top vines — same idea as L2.
  const TOP_EDGE = 40;
  const purpleTargetX = 230; // dragon side, just right of princess
  const purpleMaxX = (topGapCX - topGapW / 2) - 18;
  const purpleX = Math.max(TOP_EDGE, Math.min(CANVAS_W - TOP_EDGE, Math.min(purpleTargetX, purpleMaxX)));
  const greenX = CANVAS_W - TOP_EDGE; // right of volcano
  const yBotTop = PLATFORMS[4].y;
  const yTopTop = PLATFORMS[5].y;

  newLadders.push({ x: purpleX, yTop: yTopTop, yBot: yBotTop });
  const purpleIdx = newLadders.length - 1;
  newLadders.push({ x: greenX, yTop: yTopTop, yBot: yBotTop });
  const greenIdx = newLadders.length - 1;

  LADDERS.length = 0;
  for (const l of newLadders) LADDERS.push(l);
  setTopLadderIndices(greenIdx, purpleIdx);

  // ── Sprout runtime
  const runtime: SproutRuntime[] = LADDERS.map((_l, i) => {
    const isTop = i === greenIdx || i === purpleIdx;
    // Variable max grow length per non-top sprout (50%–100% of full).
    const maxGrow = isTop ? 1 : (0.5 + Math.random() * 0.5);
    return {
      ladderIdx: i,
      grown: !isTop,
      regrowTimer: 0,
      growProgress: isTop ? 0 : maxGrow,
      phase: (isTop ? 'dormant' : 'idle') as SproutRuntime['phase'],
      isTop,
      topColor: i === greenIdx ? 'green' : i === purpleIdx ? 'purple' : undefined,
      watered: false,
      // All 5 sprout vines share gap 0 (single sprout platform).
      gapIdx: isTop ? -1 : 0,
      maxGrow,
    };
  });
  // Stagger initial alive timers so the vines don't all wither/regrow in
  // sync. Each non-top sprout starts at a random age within the alive
  // range, plus a per-vine phase offset.
  const aliveMaxFrames = LEVEL2_PARAMS.SPROUT_ALIVE_MAX_SEC * 60;
  for (const r of runtime) {
    if (r.isTop) continue;
    (r as any).aliveTimer = Math.round(Math.random() * aliveMaxFrames);
  }
  setSproutsRuntime(runtime);

  setCurrentLevel2Iteration(1);
}

/** Permanent hole descriptors for L3 — host pushes these into the L2 holes
 *  array right after initLevel2 so falling-through works automatically. */
export function getLevel3PermanentHoles(): {
  platformIdx: number; centerX: number; width: number; ttl: number;
}[] {
  return [
    // Sprout platform drop-hole
    { platformIdx: 4, centerX: (SPROUT_DROP_X1 + SPROUT_DROP_X2) / 2, width: SPROUT_DROP_X2 - SPROUT_DROP_X1, ttl: -1 },
  ];
}
