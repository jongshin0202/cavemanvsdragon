// ============================================================
// Level 2 — developer-tunable parameters
// ============================================================

export const LEVEL2_PARAMS = {
  // ─── TEST / DEBUG ────────────────────────────────────────────
  TEST_SKIP_TO_LEVEL2: true,
  DOUBLE_TAP_MAX_GAP_MS: 400,

  // ─── MONKEYS ─────────────────────────────────────────────────
  MAX_MONKEYS: 4,
  MIN_MONKEYS_PER_PLATFORM: 1,
  /** Max monkeys wearing GREEN jackets at any moment. */
  GREEN_JACKET_BASE: 1,
  /** Max monkeys wearing PURPLE jackets at any moment (after volcano sealed). */
  PURPLE_JACKET_BASE: 2,
  /** Min/Max wait (seconds) after a monkey's apple leaves the screen
   *  before that monkey may throw another. */
  APPLE_COOLDOWN_MIN_SEC: 2,
  APPLE_COOLDOWN_MAX_SEC: 5,
  /** Apple horizontal speed (pixels per frame). */
  APPLE_SPEED: 2.2,
  /** Frames the player remains ducked when pressing Down (just enough
   *  to clear an apple, like a reverse jump). */
  DUCK_FRAMES: 32,

  // ─── VOLCANO / FIREBALLS ─────────────────────────────────────
  MAX_FIREBALLS: 1,
  FIREBALL_INTERVAL_SEC: 3.5,
  FIREBALL_START_RADIUS: 4,
  FIREBALL_END_RADIUS: 14,
  FIREBALL_FLIGHT_SEC: 1.6,

  // ─── PLATFORM HOLES ──────────────────────────────────────────
  /** Width (px) of the hole punched into a platform on fireball impact —
   *  player can jump over this gap. */
  HOLE_WIDTH: 28,
  /** Hole lifetime range (seconds) — randomly rolled per hole. */
  HOLE_MIN_LIFETIME_SEC: 2,
  HOLE_MAX_LIFETIME_SEC: 5,

  // ─── SPROUTS ────────────────────────────────────────────────
  SPROUTS_PER_GAP_MIN: 1,
  SPROUTS_PER_GAP_MAX: 3,
  SPROUT_REGROW_MIN_SEC: 2,
  SPROUT_REGROW_MAX_SEC: 5,

  // ─── TOP PLATFORM SPLIT ─────────────────────────────────────
  /** Width (px) of the permanent gap between dragon-side and volcano-side
   *  on the TOP platform. Player must jump over it. */
  TOP_GAP_WIDTH: 36,

  // ─── VOLCANO ROCK ───────────────────────────────────────────
  /** Pop-up vy when volcano coughs out the grey sealing rock. */
  VOLCANO_ROCK_VY: -7,
  /** How wide/tall the carryable rock is (px). */
  VOLCANO_ROCK_SIZE: 14,

  // ─── DIFFICULTY RAMP (per L2 round completed) ───────────────
  RAMP_MONKEYS_PER_ROUND: 1,
  RAMP_MONKEY_SPEED_PER_ROUND: 0.10,
  RAMP_FIREBALLS_PER_ROUND: 1,
};

export type Level2Params = typeof LEVEL2_PARAMS;
