// ============================================================
// Level 3 — Stage finite-state machine
// ------------------------------------------------------------
// Drives the staged progression of a Level-3 round:
//   A 'mps'            — clear the moving-platform monkeys (1/row).
//   B 'sproutsGrowing' — sprouts grow; TP monkeys throw apples; bat reflects.
//   C 'green'          — green watering can → green seed → grey rock.
//   D 'rock'           — bring rock to volcano → seal → wave + purple monkey.
//   E 'purple'         — purple can → purple seed → climb to princess.
//   F 'climb'          — climbing the purple sprout to the top.
//   G 'ending'         — princess/dragon outro (handled by L2 outro reuse).
// ============================================================

export type L3Stage =
  | 'mps'
  | 'sproutsGrowing'
  | 'green'
  | 'rock'
  | 'purple'
  | 'climb'
  | 'ending';

export interface L3StageState {
  stage: L3Stage;
  // Stage A: count of MPS monkeys killed (target = 4, one per row).
  mpsMonkeysKilled: number;
  mpsMonkeyTarget: number;
  // Stage D wave flag — set true once the volcano is sealed.
  waveActive: boolean;
}

let state: L3StageState = makeInitial();

function makeInitial(): L3StageState {
  return {
    stage: 'mps',
    mpsMonkeysKilled: 0,
    mpsMonkeyTarget: 4,
    waveActive: false,
  };
}

export function resetL3Stage(): void {
  state = makeInitial();
}

export function getL3Stage(): L3Stage { return state.stage; }
export function getL3StageState(): L3StageState { return state; }

/** Sprouts are only allowed to grow once the MPS clear is complete. */
export function sproutsAllowedToGrow(): boolean {
  return state.stage !== 'mps';
}

/** Called when an MPS monkey is killed. */
export function notifyMpsMonkeyKilled(): void {
  if (state.stage !== 'mps') return;
  state.mpsMonkeysKilled++;
  if (state.mpsMonkeysKilled >= state.mpsMonkeyTarget) {
    state.stage = 'sproutsGrowing';
  }
}

/** Manual stage advancement hooks for host glue. */
export function setL3Stage(s: L3Stage): void { state.stage = s; }
export function setWaveActive(v: boolean): void { state.waveActive = v; }
