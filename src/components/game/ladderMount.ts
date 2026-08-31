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

/**
 * Decide whether an Up input may start a ladder climb.
 *
 * A newly pressed jump wins the current frame, but a jump button that remains
 * held must not permanently lock the player out of ladders. Mobile browsers
 * can lose the matching pointer-up event during fullscreen/layout changes, so
 * using the raw held state here made a visibly active Up button do nothing.
 */
export function canStartLadderClimb(
  wantsUp: boolean,
  hasNearbyLadder: boolean,
  jumpJustPressed: boolean,
  isAlreadyClimbing: boolean,
  canMountHere: boolean,
): boolean {
  return wantsUp
    && hasNearbyLadder
    && !jumpJustPressed
    && (isAlreadyClimbing || canMountHere);
}
