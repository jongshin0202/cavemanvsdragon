// ============================================================
// Level 2 — developer-tunable parameters & per-iteration difficulty
// ============================================================
//
// The static block is the iteration-1 baseline. `getLevel2Difficulty(iter)`
// applies the per-iteration ramp described in the design doc:
//
//   ITERATION 1 (baseline)
//   ─────────────────────
//   • Fire rock speed                  : 10% of current (90% slower)
//   • Fire rock interval               : current * 1.7 (70% longer)
//   • Max fire rocks at once           : 1
//   • Max monkeys at any given time    : 2
//   • Apples thrown                    : NO
//   • Sprout living time               : current * 1.9 (90% longer)
//   • Hole fill (TTL) time             : current * 0.5 (50% faster)
//   • Monkey respawn delay             : current * 1.5 (50% slower spawn)
//   • Green-jacket monkeys             : 1
//   • Purple-jacket monkeys            : 1
//
//   PER-ITERATION RAMP (iter ≥ 2)
//   ─────────────────────────────
//   • Max monkeys                      : +1 per iter (cap = 5 per platform = 20 total)
//   • Apples                           : ENABLED from iter 2 at 50% of current speed,
//                                        +10% speed per iter thereafter
//   • Sprout living time               : -10% per iter
//   • Hole fill time                   : +10% per iter (slower fill)
//   • Green / purple counts            : alternate +1 each iter
//                                        (iter 2 → +1 green, iter 3 → +1 purple, …)
//   • Fire rock speed                  : +10% per iter
//   • Fire rock interval               : -10% per iter
//   • Max fire rocks                   : +1 every 3 iterations
//                                        (multiple rocks have random speeds up to
//                                         the iteration's max speed)
// ============================================================

export const LEVEL2_PARAMS = {
  // ─── TEST / DEBUG ────────────────────────────────────────────
  TEST_SKIP_TO_LEVEL2: true,
  DOUBLE_TAP_MAX_GAP_MS: 400,

  // ─── MONKEYS (baseline; iteration ramp via getLevel2Difficulty) ─
  MAX_MONKEYS: 2,
  MIN_MONKEYS_PER_PLATFORM: 1,
  MAX_MONKEYS_PER_PLATFORM_CAP: 5,
  MAX_MONKEYS_TOTAL_CAP: 20,
  /** Baseline jacket counts (iteration 1). */
  GREEN_JACKET_BASE: 1,
  PURPLE_JACKET_BASE: 1,
  /** Min/Max wait (seconds) after a monkey's apple leaves before re-throwing. */
  APPLE_COOLDOWN_MIN_SEC: 2,
  APPLE_COOLDOWN_MAX_SEC: 5,
  /** Apple horizontal speed at iter 2 baseline = 50% of "current" 2.2 = 1.1 px/frame.
   *  Per-iter ramp adds +10% from there. Iter 1 has apples disabled entirely. */
  APPLE_SPEED: 1.1,
  /** Frames the player remains ducked when pressing Down. */
  DUCK_FRAMES: 32,

  // ─── VOLCANO / FIREBALLS (iteration-1 baseline) ─────────────
  /** Iter-1 max fireballs; +1 every 3 iters (handled in difficulty fn). */
  MAX_FIREBALLS: 1,
  /** Iter-1 interval = previous 3.5s * 1.7 = 5.95s. */
  FIREBALL_INTERVAL_SEC: 5.95,
  FIREBALL_START_RADIUS: 4,
  FIREBALL_END_RADIUS: 14,
  /** Iter-1 flight = 12.8s (90% slower than previous 1.6s, then 25% faster). */
  FIREBALL_FLIGHT_SEC: 12.8,

  // ─── PLATFORM HOLES ──────────────────────────────────────────
  HOLE_WIDTH: 28,
  /** Iter-1 hole TTL is half of previous (2..5 → 1..2.5s). Per-iter +10%. */
  HOLE_MIN_LIFETIME_SEC: 1,
  HOLE_MAX_LIFETIME_SEC: 2.5,
  /** Extra random "+5..10s" buffer is also halved at iter 1. */
  HOLE_EXTRA_MIN_SEC: 2.5,
  HOLE_EXTRA_MAX_SEC: 5,

  // ─── SPROUTS ────────────────────────────────────────────────
  SPROUTS_PER_GAP_MIN: 2,
  SPROUTS_PER_GAP_MAX: 3,
  /** Iter-1 regrow window (per-iter -10% each iter — sprouts live shorter,
   *  but regrow also reflects "living longer" intent at iter 1). */
  SPROUT_REGROW_MIN_SEC: 2,
  SPROUT_REGROW_MAX_SEC: 5,
  /** Iter-1 alive (visible) window — previously (5.7..9.5)s, increased
   *  another 50% → (8.55..14.25)s. Per-iter ramp shrinks this by 10% each iter. */
  SPROUT_ALIVE_MIN_SEC: 8.55,
  SPROUT_ALIVE_MAX_SEC: 14.25,

  // ─── TOP PLATFORM SPLIT ─────────────────────────────────────
  TOP_GAP_WIDTH: 36,

  // ─── VOLCANO ROCK ───────────────────────────────────────────
  VOLCANO_ROCK_VY: -7,
  VOLCANO_ROCK_SIZE: 14,

  // ─── MONKEY RESPAWN (random 2–5s delay before replacement spawns) ───
  MONKEY_RESPAWN_MIN_FRAMES: 120, // 2s @ 60fps
  MONKEY_RESPAWN_MAX_FRAMES: 300, // 5s @ 60fps

  // ─── (legacy ramp constants kept for reference) ─────────────
  RAMP_MONKEYS_PER_ROUND: 1,
  RAMP_MONKEY_SPEED_PER_ROUND: 0.10,
  RAMP_FIREBALLS_PER_ROUND: 1,
};

export type Level2Params = typeof LEVEL2_PARAMS;

// ============================================================
// Per-iteration difficulty resolver
// ============================================================

export interface Level2Difficulty {
  iteration: number;
  /** Max simultaneous monkeys on the playfield. */
  maxMonkeys: number;
  /** Max simultaneous monkeys per platform. */
  maxMonkeysPerPlatform: number;
  /** Number of green-jacket monkeys this iteration. */
  greenJacketCount: number;
  /** Number of purple-jacket monkeys this iteration. */
  purpleJacketCount: number;
  /** False on iter 1 — apples are disabled. */
  applesEnabled: boolean;
  /** Apple horizontal speed (pixels per frame). */
  appleSpeed: number;
  /** Max simultaneous fire rocks (volcano fireballs). */
  maxFireballs: number;
  /** Time between fire rock launches (seconds). */
  fireballIntervalSec: number;
  /** Min flight time of a fire rock at this iteration. With multiple
   *  fireballs allowed, each flight is randomized in [min, max]. */
  fireballFlightMinSec: number;
  fireballFlightMaxSec: number;
  /** Sprout alive (visible) window (seconds). */
  sproutAliveMinSec: number;
  sproutAliveMaxSec: number;
  /** Sprout regrow time when withered (seconds). */
  sproutRegrowMinSec: number;
  sproutRegrowMaxSec: number;
  /** Hole TTL window (seconds). Lower = filled faster. */
  holeLifeMinSec: number;
  holeLifeMaxSec: number;
  /** Extra random buffer added to hole TTL (seconds). */
  holeExtraMinSec: number;
  holeExtraMaxSec: number;
  /** Monkey respawn delay window (frames @ 60fps). */
  respawnMinFrames: number;
  respawnMaxFrames: number;
  /** Monkey movement speed multiplier on ROBOT_SPEED. Iter 1 = 0.5 (50%);
   *  +10% per iter thereafter. */
  monkeySpeedMul: number;
  /** Random extra (0..jitter) added to the multiplier per monkey. */
  monkeySpeedJitter: number;
}

export function getLevel2Difficulty(iteration: number): Level2Difficulty {
  const iter = Math.max(1, Math.floor(iteration));
  const steps = iter - 1; // ramp count

  // Max monkeys: +1 per iter, cap = 20 (5 per platform * 4 platforms).
  const maxMonkeys = Math.min(
    LEVEL2_PARAMS.MAX_MONKEYS_TOTAL_CAP,
    LEVEL2_PARAMS.MAX_MONKEYS + steps,
  );
  const maxMonkeysPerPlatform = Math.min(
    LEVEL2_PARAMS.MAX_MONKEYS_PER_PLATFORM_CAP,
    1 + Math.floor(steps / 4), // 4 platforms → +1 per-platform cap each 4 iters
  );

  // Green/purple alternate: iter 2 → +1 green, iter 3 → +1 purple, etc.
  // steps=0 → (1,1); steps=1 → (2,1); steps=2 → (2,2); steps=3 → (3,2)…
  const greenAdds = Math.ceil(steps / 2);
  const purpleAdds = Math.floor(steps / 2);
  const greenJacketCount = LEVEL2_PARAMS.GREEN_JACKET_BASE + greenAdds;
  const purpleJacketCount = LEVEL2_PARAMS.PURPLE_JACKET_BASE + purpleAdds;

  // Apples: iter 1 disabled; from iter 2 baseline + 10% per extra step.
  const applesEnabled = iter >= 2;
  const appleStepFactor = 1 + 0.10 * Math.max(0, iter - 2);
  const appleSpeed = LEVEL2_PARAMS.APPLE_SPEED * appleStepFactor;

  // Fireball count: +1 every 3 iterations (iter 1 = 1, iter 4 = 2, iter 7 = 3…).
  const maxFireballs = LEVEL2_PARAMS.MAX_FIREBALLS + Math.floor(steps / 3);

  // Fireball cadence: -10% interval per iter (faster).
  const intervalFactor = Math.pow(0.9, steps);
  const fireballIntervalSec = LEVEL2_PARAMS.FIREBALL_INTERVAL_SEC * intervalFactor;

  // Fireball speed: +10% per iter → flight time *0.9 per iter.
  const flightFactor = Math.pow(0.9, steps);
  const baseFlight = LEVEL2_PARAMS.FIREBALL_FLIGHT_SEC * flightFactor;
  // When multiple rocks coexist, randomize each rock's flight in [base*0.6, base].
  // (A faster flight = "up to max speed" since speed is inverse to flight time.)
  const fireballFlightMinSec = maxFireballs > 1 ? baseFlight * 0.6 : baseFlight;
  const fireballFlightMaxSec = baseFlight;

  // Sprout alive: -10% per iter from the iter-1 baseline.
  const aliveFactor = Math.pow(0.9, steps);
  const sproutAliveMinSec = LEVEL2_PARAMS.SPROUT_ALIVE_MIN_SEC * aliveFactor;
  const sproutAliveMaxSec = LEVEL2_PARAMS.SPROUT_ALIVE_MAX_SEC * aliveFactor;

  // Regrow: keep static for now (alive window is the "lifetime" the user spec'd).
  const sproutRegrowMinSec = LEVEL2_PARAMS.SPROUT_REGROW_MIN_SEC;
  const sproutRegrowMaxSec = LEVEL2_PARAMS.SPROUT_REGROW_MAX_SEC;

  // Hole TTL: +10% per iter (slower to fill).
  const holeFactor = Math.pow(1.1, steps);
  const holeLifeMinSec = LEVEL2_PARAMS.HOLE_MIN_LIFETIME_SEC * holeFactor;
  const holeLifeMaxSec = LEVEL2_PARAMS.HOLE_MAX_LIFETIME_SEC * holeFactor;
  const holeExtraMinSec = LEVEL2_PARAMS.HOLE_EXTRA_MIN_SEC * holeFactor;
  const holeExtraMaxSec = LEVEL2_PARAMS.HOLE_EXTRA_MAX_SEC * holeFactor;

  // Respawn: keep iter-1 baseline (per spec, monkey total grows with iter,
  // not respawn cadence — spec only set iter-1 spawn 50% slower).
  const respawnMinFrames = LEVEL2_PARAMS.MONKEY_RESPAWN_MIN_FRAMES;
  const respawnMaxFrames = LEVEL2_PARAMS.MONKEY_RESPAWN_MAX_FRAMES;

  // Monkey movement speed: iter 1 = 0.25 (25% of ROBOT_SPEED, halved from
  // previous 0.5 baseline), +25% per iter.
  const monkeySpeedMul = 0.25 * (1 + 0.25 * steps);
  const monkeySpeedJitter = 0.4;

  return {
    iteration: iter,
    maxMonkeys,
    maxMonkeysPerPlatform,
    greenJacketCount,
    purpleJacketCount,
    applesEnabled,
    appleSpeed,
    maxFireballs,
    fireballIntervalSec,
    fireballFlightMinSec,
    fireballFlightMaxSec,
    sproutAliveMinSec,
    sproutAliveMaxSec,
    sproutRegrowMinSec,
    sproutRegrowMaxSec,
    holeLifeMinSec,
    holeLifeMaxSec,
    holeExtraMinSec,
    holeExtraMaxSec,
    respawnMinFrames,
    respawnMaxFrames,
    monkeySpeedMul,
    monkeySpeedJitter,
  };
}

/** Module-level "current iteration" used by code paths that don't have direct
 *  access to L2State (layout sprout timers). Updated by initLevel2. */
let _currentIteration = 1;
export function setCurrentLevel2Iteration(iter: number): void {
  _currentIteration = Math.max(1, Math.floor(iter));
}
export function getCurrentLevel2Difficulty(): Level2Difficulty {
  return getLevel2Difficulty(_currentIteration);
}
