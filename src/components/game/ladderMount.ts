export function ladderMountTolerance(
  _playerWidth: number,
  _ladderHalfWidth: number,
  searchRadius: number,
): number {
  // Any ladder admitted by the nearby-ladder search should be mountable.
  // Keeping one pixel inside the search radius prevents snapping to a ladder
  // that has not actually been selected, while removing the smaller second
  // threshold that made Up intermittently fail near a ladder edge.
  return searchRadius - 1;
}

export function canMountLadder(
  distance: number,
  playerWidth: number,
  ladderHalfWidth: number,
  searchRadius: number,
): boolean {
  return distance <= ladderMountTolerance(playerWidth, ladderHalfWidth, searchRadius);
}
