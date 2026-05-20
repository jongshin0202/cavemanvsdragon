// ============================================================
// Level 4 — Boss fight tunables (per-iteration formulas)
// ============================================================

export const LEVEL4_PARAMS = {
  // Iter-1 baselines
  HEARTS_TO_FILL_BASE: 2,            // iter1 = 2, +1 per iter until 5
  HEARTS_TO_FILL_CAP: 5,
  SHRINK_SEC_BASE: 10,               // iter1 = 10s
  SHRINK_SEC_FLOOR: 3,
  SHRINK_SCALE_PER_ITER: 0.9,        // -10% per iter
  FLASH_SEC: 2,                      // last 2s of shrink = flash window
  HITS_TO_KILL_BASE: 3,              // iter1 = 3 (ramps after meter cap)
  DRAGON_SPEED_PER_ITER: 0.10,       // +10% per iter (relative to caveman)
  MONKEYS_BASE: 2,                   // iter1 = 2, +1 per iter
  MONKEY_RESPAWN_MIN_SEC: 2,
  MONKEY_RESPAWN_MAX_SEC: 5,
  // Heart spawn cadence (princess throws)
  HEART_SPAWN_MIN_SEC: 1.4,
  HEART_SPAWN_MAX_SEC: 3.0,
  // Heart leaf-fall physics
  HEART_VY_MAX: 0.85,
  HEART_VY_ACCEL: 0.015,
  HEART_SWAY_AMP: 1.6,
  HEART_SWAY_HZ: 0.9,
  // Bird-stun after stomp
  BIRD_STUN_SEC: 2,
  // Volcano (mirrors L2 baseline; no green can to stop it)
  FIREBALL_INTERVAL_SEC: 5.95,
  FIREBALL_FLIGHT_SEC: 12.8,
  FIREBALL_START_R: 4,
  FIREBALL_END_R: 14,
  // Sprouts (mirrors L2 numerical values)
  SPROUT_ALIVE_MIN_SEC: 8.55,
  SPROUT_ALIVE_MAX_SEC: 14.25,
  SPROUT_REGROW_MIN_SEC: 2,
  SPROUT_REGROW_MAX_SEC: 5,
  SPROUT_GROW_FRAMES: 68,
};

export interface Level4Difficulty {
  iteration: number;
  heartsToFill: number;
  shrinkSec: number;
  hitsToKill: number;
  dragonSpeedMul: number;
  monkeyCount: number;
}

export function getLevel4Difficulty(iter: number): Level4Difficulty {
  const i = Math.max(1, Math.floor(iter));
  const steps = i - 1;
  const heartsToFill = Math.min(
    LEVEL4_PARAMS.HEARTS_TO_FILL_CAP,
    LEVEL4_PARAMS.HEARTS_TO_FILL_BASE + steps,
  );
  const shrinkSec = Math.max(
    LEVEL4_PARAMS.SHRINK_SEC_FLOOR,
    LEVEL4_PARAMS.SHRINK_SEC_BASE * Math.pow(LEVEL4_PARAMS.SHRINK_SCALE_PER_ITER, steps),
  );
  // hitsToKill = 3 until heartsToFill reaches cap, then +1 per iter
  const itersAfterCap = Math.max(0, i - (LEVEL4_PARAMS.HEARTS_TO_FILL_CAP - LEVEL4_PARAMS.HEARTS_TO_FILL_BASE + 1));
  const hitsToKill = LEVEL4_PARAMS.HITS_TO_KILL_BASE + itersAfterCap;
  const dragonSpeedMul = 1 * Math.pow(1 + LEVEL4_PARAMS.DRAGON_SPEED_PER_ITER, steps);
  const monkeyCount = LEVEL4_PARAMS.MONKEYS_BASE + steps;
  return { iteration: i, heartsToFill, shrinkSec, hitsToKill, dragonSpeedMul, monkeyCount };
}
