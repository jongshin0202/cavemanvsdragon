export type AttractScreen =
  | 'intro'
  | 'attractControls'
  | 'attractLocalLeaderboard'
  | 'attractGlobalLeaderboard';

const MOBILE_ATTRACT_SEQUENCE: readonly AttractScreen[] = [
  'intro',
  'attractLocalLeaderboard',
  'attractGlobalLeaderboard',
];

const DESKTOP_ATTRACT_SEQUENCE: readonly AttractScreen[] = [
  'intro',
  'attractControls',
  'attractLocalLeaderboard',
  'attractGlobalLeaderboard',
];

export function isAttractScreen(value: string): value is AttractScreen {
  return value === 'intro'
    || value === 'attractControls'
    || value === 'attractLocalLeaderboard'
    || value === 'attractGlobalLeaderboard';
}

export function adjacentAttractScreen(
  current: AttractScreen,
  mobileFlow: boolean,
  direction: -1 | 1,
): AttractScreen {
  const sequence = mobileFlow ? MOBILE_ATTRACT_SEQUENCE : DESKTOP_ATTRACT_SEQUENCE;
  const currentIndex = sequence.indexOf(current);
  const normalizedIndex = currentIndex < 0 ? 0 : currentIndex;
  return sequence[(normalizedIndex + direction + sequence.length) % sequence.length];
}
