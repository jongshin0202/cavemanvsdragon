// Level 2 internal types. Kept separate from level 1's `constants.ts`
// so changes here cannot ripple back into level 1.

import type { Robot } from '../constants';

export type JacketColor = null | 'green' | 'purple';

export interface L2Monkey extends Omit<Robot, 'wanderTimer' | 'wanderDir'> {
  jacket: JacketColor;
  // Apple-throwing state (jacketed monkeys only)
  appleCooldown: number;     // frames until allowed to throw again
  hasAppleInFlight: boolean; // true while this monkey's apple is alive
  wanderTimer?: number;
  wanderDir?: number;
}

export interface L2Apple {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;        // horizontal velocity
  ownerId: number;   // index into monkeys[] of throwing monkey
}

export interface L2Fireball {
  // Trajectory parameters (parametric so size can grow as t→1)
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  apexY: number;     // peak height (y-min) of arc
  t: number;         // 0..1 progress along flight
  duration: number;  // total flight frames
  landed: boolean;
  // Current draw state
  x: number;
  y: number;
  radius: number;
}

export interface L2Hole {
  platformIdx: number; // index into PLATFORMS
  centerX: number;
  width: number;
  /** frames remaining; -1 means permanent until level ends */
  ttl: number;
}

export type SproutSide = 'left' | 'center' | 'right';

export interface L2Sprout {
  /** Platform index this sprout sits ON TOP OF (its base). */
  basePlatformIdx: number;
  /** Platform index it leads UP to. */
  topPlatformIdx: number;
  x: number;        // horizontal position
  yTop: number;
  yBot: number;
  grown: boolean;   // true if currently usable
  regrowTimer: number; // frames until grown again (0 if grown)
}

export interface L2WateringCan {
  x: number;
  y: number;
  w: number;
  h: number;
  color: 'green' | 'purple';
  collected: boolean;
}

/** A flying rock launched out of the volcano (for sealing). Pre-landing
 *  it follows simple physics; post-landing it sits as a pickup. */
export interface L2VolcanoRock {
  x: number; y: number; w: number; h: number;
  vx: number; vy: number;
  /** false while in flight, true after landing on a platform. */
  landed: boolean;
  /** true once the player picks it up. */
  collected: boolean;
}

/** Top-level state container for Level 2. */
export interface L2State {
  initialized: boolean;
  round: number;
  // entities
  monkeys: L2Monkey[];
  apples: L2Apple[];
  fireballs: L2Fireball[];
  holes: L2Hole[];
  sprouts: L2Sprout[];
  // volcano / progression
  volcanoSealed: boolean;
  /** True after green sprout is grown and the volcano coughs up a rock.
   *  Once true, no more rocks spawn. */
  rockSpawned: boolean;
  /** Rock entity (in flight or sitting on a platform), or null. */
  volcanoRock: L2VolcanoRock | null;
  /** Watering cans on the ground (one for green, one for purple). */
  greenCan: L2WateringCan | null;
  purpleCan: L2WateringCan | null;
  /** Color the player is currently carrying (null if not carrying). */
  carryingCan: 'green' | 'purple' | null;
  /** True while the player is carrying the volcano-seal rock. */
  carryingRock: boolean;
  // monkey phase
  /** True after the volcano is sealed — purple-jacket spawning enabled. */
  purpleJacketPhase: boolean;
  /** Total purple-jacketed monkeys killed this round (target = purpleTarget). */
  purpleJacketsKilled: number;
  /** Random per-round target: how many purple-jacket monkeys must be killed
   *  before the purple watering can spawns. Rolled at initLevel2. */
  purpleTarget: number;
  /** Total green-jacketed monkeys killed this round (target = GREEN_JACKET_BASE). */
  greenJacketsKilled: number;
  /** True once the green watering can has been spawned (level start). */
  greenCanSpawned: boolean;
  /** True once the purple watering can has been spawned. */
  purpleCanSpawned: boolean;
  // timers
  fireballTimer: number;
  // outro
  winOutro: { active: boolean; phase: 'grab' | 'pause' | 'follow' | 'done'; timer: number };
}

export function makeEmptyL2State(): L2State {
  return {
    initialized: false,
    round: 1,
    monkeys: [],
    apples: [],
    fireballs: [],
    holes: [],
    sprouts: [],
    volcanoSealed: false,
    rockSpawned: false,
    volcanoRock: null,
    greenCan: null,
    purpleCan: null,
    carryingCan: null,
    carryingRock: false,
    purpleJacketPhase: false,
    purpleJacketsKilled: 0,
    greenJacketsKilled: 0,
    greenCanSpawned: false,
    purpleCanSpawned: false,
    fireballTimer: 0,
    winOutro: { active: false, phase: 'grab', timer: 0 },
  };
}
