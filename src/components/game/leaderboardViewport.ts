export function isLandscapeLeaderboardViewport(width: number, height: number): boolean {
  return Number.isFinite(width) && Number.isFinite(height) && width > height;
}
