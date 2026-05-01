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

/** Top-level state container for Level 2. Owned by the host through
 *  a single ref; never reaches into level 1 state. */
export interface L2State {
  initialized: boolean;
  round: number; // L2 round count (1 = first time playing L2)
  // entities
  monkeys: L2Monkey[];
  apples: L2Apple[];
  fireballs: L2Fireball[];
  holes: L2Hole[];
  sprouts: L2Sprout[];
  // volcano / progression
  volcanoSealed: boolean;
  greenCan: L2WateringCan | null;
  purpleCan: L2WateringCan | null;
  greenSproutGrown: boolean;  // sprout that lets caveman reach volcano
  purpleSproutGrown: boolean; // sprout that lets caveman reach princess
  carryingCan: 'green' | 'purple' | null;
  carryingRock: boolean;
  rockEntity: { x: number; y: number; w: number; h: number; collected: boolean } | null;
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
    greenCan: null,
    purpleCan: null,
    greenSproutGrown: false,
    purpleSproutGrown: false,
    carryingCan: null,
    carryingRock: false,
    rockEntity: null,
    fireballTimer: 0,
    winOutro: { active: false, phase: 'grab', timer: 0 },
  };
}
