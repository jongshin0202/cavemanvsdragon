// Centralized scoring rules. All scores follow: base * (iteration + 1) / 2
// (rounded). `iteration` = getLevelIteration(round) for the current level.

export type ScoreAction =
  | 'jumpRock'
  | 'jumpApple'
  | 'killMonkey'
  | 'coverVolcano'
  | 'waterGreen'
  | 'waterPurple'
  | 'bonkDragon'
  | 'killDragon'
  | 'completeLevel'        // L1/L2/L3 = 1000
  | 'completeLevel4';      // L4 = 5000

const BASE: Record<ScoreAction, number> = {
  jumpRock: 100,
  jumpApple: 100,
  killMonkey: 300,
  coverVolcano: 500,
  waterGreen: 500,
  waterPurple: 500,
  bonkDragon: 1000,
  killDragon: 3000,
  completeLevel: 1000,
  completeLevel4: 5000,
};

export function scoreFor(action: ScoreAction, iteration: number): number {
  const iter = Math.max(1, iteration | 0);
  return Math.round(BASE[action] * (iter + 1) / 2);
}
