// Cloudflare Worker-backed global leaderboard.
// Shared across web, Android, iOS, and PC builds.
//
// The game reads only on launch and when the global leaderboard is displayed.
// Scores use an invisible per-installation identity; players never see an
// account, password, email, or login prompt.
import { MAX_ENTRIES } from './leaderboard';
import { fetchWorkerLeaderboard, submitWorkerScore, type WorkerLeaderboardEntry } from './workerApi';

export interface GlobalEntry {
  id?: string;
  name: string;
  score: number;
  level?: number;
  created_at?: string;
}

const CACHE_KEY = 'cavemanVsDragon.globalTop.worker.v1';

interface CachedShape {
  signature: { count: number; latest: string | null };
  rows: GlobalEntry[];
}

let memCache: CachedShape | null = null;

function loadCacheFromStorage(): CachedShape | null {
  if (memCache) return memCache;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedShape;
    if (
      !parsed ||
      !Array.isArray(parsed.rows) ||
      !parsed.signature ||
      typeof parsed.signature.count !== 'number'
    ) {
      return null;
    }
    memCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(rows: GlobalEntry[], signature: CachedShape['signature']): void {
  memCache = { signature, rows };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(memCache));
  } catch {
    // Ignore storage quota and privacy-mode failures.
  }
}

function topN(rows: GlobalEntry[], n: number = MAX_ENTRIES): GlobalEntry[] {
  const seen = new Set<string>();
  const deduped: GlobalEntry[] = [];
  for (const row of rows) {
    const key = row.id || `${row.name}|${row.score}|${row.created_at || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped
    .sort((a, b) => b.score - a.score || (a.created_at || '').localeCompare(b.created_at || ''))
    .slice(0, n);
}

function toGlobalEntry(entry: WorkerLeaderboardEntry): GlobalEntry {
  return {
    id: entry.player_id,
    name: entry.display_name,
    score: entry.best_score,
    level: entry.level ?? undefined,
    created_at: entry.achieved_at,
  };
}

export function getCachedGlobal(): GlobalEntry[] {
  return loadCacheFromStorage()?.rows ?? [];
}

export async function checkAndRefresh(
  limit: number = MAX_ENTRIES,
): Promise<GlobalEntry[]> {
  try {
    const result = await fetchWorkerLeaderboard(limit);
    const rows = result.entries.map(toGlobalEntry);
    const latest = result.entries.reduce<string | null>((current, entry) => {
      const candidate = entry.updated_at || entry.achieved_at;
      return !current || candidate > current ? candidate : current;
    }, null);
    saveCache(rows, { count: result.total, latest });
    return rows;
  } catch (error) {
    console.error(
      '[globalLeaderboard] Worker fetch failed:',
      error instanceof Error ? error.message : 'unknown error',
    );
    return loadCacheFromStorage()?.rows ?? [];
  }
}

export function qualifiesForGlobal(score: number, list: GlobalEntry[]): boolean {
  if (score <= 0) return false;
  if (list.length < MAX_ENTRIES) return true;
  return score > list[list.length - 1].score;
}

export async function submitGlobalScore(entry: {
  name: string;
  score: number;
  level?: number;
}): Promise<GlobalEntry | null> {
  try {
    const result = await submitWorkerScore(entry);
    if (!result.entry) return null;
    const row = toGlobalEntry(result.entry);
    const current = loadCacheFromStorage();
    const merged = topN([row, ...(current?.rows ?? [])]);
    saveCache(merged, {
      count: Math.max(current?.signature.count ?? 0, merged.length),
      latest: result.entry.updated_at || result.entry.achieved_at,
    });
    return row;
  } catch (error) {
    console.error(
      '[globalLeaderboard] Worker submission failed:',
      error instanceof Error ? error.message : 'unknown error',
    );
    return null;
  }
}
