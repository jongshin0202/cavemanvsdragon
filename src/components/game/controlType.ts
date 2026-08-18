export type GameplayControlType = 'keyboard' | 'touch' | 'gamepad' | 'mixed' | 'unknown';

type ConcreteGameplayControlType = Exclude<GameplayControlType, 'mixed' | 'unknown'>;

const usedControlTypes = new Set<ConcreteGameplayControlType>();
const gameplayControlKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']);

export function resetGameplayControlType(): void {
  usedControlTypes.clear();
}

export function recordGameplayControlInput(type: ConcreteGameplayControlType): void {
  usedControlTypes.add(type);
}

export function recordGameplayControlKey(
  type: ConcreteGameplayControlType,
  key: string,
  gameplayActive: boolean,
): void {
  if (!gameplayActive || !gameplayControlKeys.has(key)) return;
  recordGameplayControlInput(type);
}

export function getGameplayControlType(): GameplayControlType {
  if (usedControlTypes.size === 0) return 'unknown';
  if (usedControlTypes.size > 1) return 'mixed';
  return usedControlTypes.values().next().value ?? 'unknown';
}
