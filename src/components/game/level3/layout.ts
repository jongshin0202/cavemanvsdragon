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
import { resetL3Stage } from './stage';

/** X-bounds of the permanent split in the 2-piece P3 platform. */
export let MID_SPLIT_X1 = 0;
export let MID_SPLIT_X2 = 0;
/** X-bounds of the permanent drop-hole in the sprout platform (P4). */
export let SPROUT_DROP_X1 = 0;
export let SPROUT_DROP_X2 = 0;
/** X-bounds of the small floating platform (P1) — exposed for fireball aim. */
export let FLOAT_X1 = 0;
export let FLOAT_X2 = 0;

const L3_VINE_BOTTOM_Y = 324;
const L3_MIN_VINE_GROW = 0.5;

export function applyLevel3Layout(iter: number = 1): void {
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

  // ── P3 — REMOVED. Its y is kept as the sprout endpoint only: vines now
  //   reach the top moving-platform lane so the player can transfer cleanly.
  PLATFORMS[3].x1 = 0;        PLATFORMS[3].x2 = 0;         PLATFORMS[3].y = L3_VINE_BOTTOM_Y;

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
  SPROUT_DROP_X1 = 248; SPROUT_DROP_X2 = 360;

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

  // ── Sprout runtime — Stage A: NO non-top sprouts are grown until the
  //   player clears the MPS monkeys. They sit dormant with a huge regrow
  //   timer that the stage FSM zeroes out when the stage advances.
  const runtime: SproutRuntime[] = LADDERS.map((_l, i) => {
    const isTop = i === greenIdx || i === purpleIdx;
    const maxGrow = isTop ? 1 : (L3_MIN_VINE_GROW + Math.random() * (1 - L3_MIN_VINE_GROW));
    return {
      ladderIdx: i,
      grown: false,
      regrowTimer: isTop ? 0 : 999999,
      growProgress: 0,
      phase: 'dormant' as SproutRuntime['phase'],
      isTop,
      topColor: i === greenIdx ? 'green' : i === purpleIdx ? 'purple' : undefined,
      watered: false,
      gapIdx: isTop ? -1 : 0,
      maxGrow,
      minGrow: isTop ? undefined : L3_MIN_VINE_GROW,
    };
  });
  setSproutsRuntime(runtime);

  // Reset L3 stage FSM for the new round (iter 1 starts in sproutsGrowing).
  resetL3Stage(iter);

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
