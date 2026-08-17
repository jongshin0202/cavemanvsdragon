const LADDER_MOUNT_ASSIST_PX = 10;

export function ladderMountTolerance(
  playerWidth: number,
  ladderHalfWidth: number,
  searchRadius: number,
): number {
  const overlapTolerance = playerWidth / 2 + ladderHalfWidth;
  return Math.min(searchRadius - 1, overlapTolerance + LADDER_MOUNT_ASSIST_PX);
}

export function canMountLadder(
  distance: number,
  playerWidth: number,
  ladderHalfWidth: number,
  searchRadius: number,
): boolean {
  return distance <= ladderMountTolerance(playerWidth, ladderHalfWidth, searchRadius);
}
