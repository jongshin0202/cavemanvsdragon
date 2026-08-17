export type GameplayControlType = 'keyboard' | 'touch' | 'gamepad' | 'mixed' | 'unknown';

type ConcreteGameplayControlType = Exclude<GameplayControlType, 'mixed' | 'unknown'>;

const usedControlTypes = new Set<ConcreteGameplayControlType>();

export function resetGameplayControlType(): void {
  usedControlTypes.clear();
}

export function recordGameplayControlInput(type: ConcreteGameplayControlType): void {
  usedControlTypes.add(type);
}

export function getGameplayControlType(): GameplayControlType {
  if (usedControlTypes.size === 0) return 'unknown';
  if (usedControlTypes.size > 1) return 'mixed';
  return usedControlTypes.values().next().value ?? 'unknown';
}
