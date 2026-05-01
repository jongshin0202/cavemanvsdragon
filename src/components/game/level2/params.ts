// ============================================================
// Level 2 — developer-tunable parameters
// ------------------------------------------------------------
// All values here are intentionally adjustable so the developer
// (via the AI) can rebalance Level 2 quickly. Changes take effect
// at the start of the next L2 round.
// ============================================================

export const LEVEL2_PARAMS = {
  // ─── TEST / DEBUG ────────────────────────────────────────────
  /** When true, the intro-screen "double tap" (mobile) or "2" key
   *  (PC) shortcut jumps directly into Level 2 for testing. */
  TEST_SKIP_TO_LEVEL2: true,
  /** Max delay (ms) between two intro taps to count as a double-tap. */
  DOUBLE_TAP_MAX_GAP_MS: 400,

  // ─── MONKEYS ─────────────────────────────────────────────────
  /** Maximum monkeys alive on the level at any time (round 1 of L2). */
  MAX_MONKEYS: 4,
  /** Each platform (P2..P5) starts with at least this many monkeys. */
  MIN_MONKEYS_PER_PLATFORM: 1,
  /** Base count of monkeys wearing GREEN jackets at any moment.
   *  Actual count each spawn rolls between BASE and BASE+1. */
  GREEN_JACKET_BASE: 1,
  /** Base count of monkeys wearing PURPLE jackets at any moment
   *  (only after volcano sealed). Rolls between BASE and BASE+1. */
  PURPLE_JACKET_BASE: 1,
  /** Cooldown (seconds) after an apple leaves the screen before the
   *  same monkey can throw another. */
  APPLE_COOLDOWN_SEC: 2,
  /** Apple horizontal speed (pixels per frame). */
  APPLE_SPEED: 1.6,

  // ─── VOLCANO / FIREBALLS ─────────────────────────────────────
  /** Maximum number of fireballs in flight at once (round 1 of L2). */
  MAX_FIREBALLS: 1,
  /** Average seconds between fireball launches (uniform jitter ±50%). */
  FIREBALL_INTERVAL_SEC: 3.5,
  /** Initial visual radius of a fireball when it leaves the volcano. */
  FIREBALL_START_RADIUS: 4,
  /** Final visual radius right before impact. */
  FIREBALL_END_RADIUS: 14,
  /** Time-of-flight (seconds) from launch to landing. */
  FIREBALL_FLIGHT_SEC: 1.6,

  // ─── PLATFORM HOLES ──────────────────────────────────────────
  /** Width (px) of the hole punched into the ground on impact. */
  HOLE_WIDTH: 28,
  /** A hole's lifetime is rolled uniformly in this range (seconds).
   *  If the rolled value equals HOLE_PERMANENT_SENTINEL, the hole
   *  remains until the level ends. */
  HOLE_MIN_LIFETIME_SEC: 2,
  HOLE_MAX_LIFETIME_SEC: 5,
  /** Chance (0..1) that a fireball hole is permanent for the level. */
  HOLE_PERMANENT_CHANCE: 0.2,

  // ─── SPROUTS ────────────────────────────────────────────────
  /** Min/Max sprouts between any two adjacent platforms (excluding
   *  the topmost gap to the volcano/dragon platform, which only
   *  appears after watering). */
  SPROUTS_PER_GAP_MIN: 1,
  SPROUTS_PER_GAP_MAX: 3,
  /** After a sprout is used (climbed up or down), it withers back
   *  into a seed and regrows after a delay rolled in this range. */
  SPROUT_REGROW_MIN_SEC: 2,
  SPROUT_REGROW_MAX_SEC: 5,

  // ─── DIFFICULTY RAMP (per L2 round completed) ───────────────
  /** +N monkeys to MAX_MONKEYS each completed L2 round. */
  RAMP_MONKEYS_PER_ROUND: 1,
  /** Multiplicative speed-up to monkeys per completed L2 round. */
  RAMP_MONKEY_SPEED_PER_ROUND: 0.10,
  /** +N to MAX_FIREBALLS each completed L2 round. */
  RAMP_FIREBALLS_PER_ROUND: 1,
};

export type Level2Params = typeof LEVEL2_PARAMS;
