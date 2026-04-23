// Global leaderboard backed by Lovable Cloud (Supabase).
// Shared across ALL platforms (web preview, Vercel, APK, mobile, PC).
//
// Cost-optimization strategy ("check on demand"):
//   We do NOT keep an open WebSocket and we do NOT poll. Instead the cache
//   is refreshed at exactly two moments:
//
//     1. On game launch (component mount)  → checkAndRefresh()
//     2. When the user enters the GLOBAL leaderboard view with a fresh
//        submission of their own                  → checkAndRefresh()
//
//   Each check is a tiny "did anything change?" probe:
//     SELECT created_at FROM global_leaderboard
//       ORDER BY created_at DESC LIMIT 1
//     + a HEAD-style count.
//   That is one row + one count, ~tens of bytes. If the (count, latest)
//   signature matches what we have cached, we return the cached list and
//   make ZERO additional reads. Only when the signature differs do we
//   pull the full top-N.
//
//   Result: an idle device that opens the game costs ~1 small probe per
//   launch; a device that submits a score costs 1 probe + 1 insert + at
//   most 1 full fetch.
import { supabase } from '@/integrations/supabase/client';
import { MAX_ENTRIES } from './leaderboard';

export interface GlobalEntry {
  id?: string;
  name: string;
  score: number;
  level?: number;
  created_at?: string;
}

const CACHE_KEY = 'cavemanVsDragon.globalTop.v2';

interface CachedShape {
  // Signature describing the server state at the time of the last full fetch.
  // If a probe returns the same signature, the cache is still authoritative.
  signature: { count: number; latest: string | null };
  rows: GlobalEntry[];
}

// In-memory cache (shared across all callers in this tab).
let memCache: CachedShape | null = null;

// ---------- Cache helpers ----------

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
    // ignore quota / privacy errors
  }
}

// Sort + clamp a list to top N, deduping by id when present.
function topN(rows: GlobalEntry[], n: number = MAX_ENTRIES): GlobalEntry[] {
  const seen = new Set<string>();
  const deduped: GlobalEntry[] = [];
  for (const r of rows) {
    const key = r.id || `${r.name}|${r.score}|${r.created_at || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }
  return deduped
    .sort((a, b) => b.score - a.score || (a.created_at || '').localeCompare(b.created_at || ''))
    .slice(0, n);
}

// ---------- Public API ----------

// Return whatever we have cached right now (in-memory or localStorage).
// Never hits the network. Useful for instant first paint.
export function getCachedGlobal(): GlobalEntry[] {
  const c = loadCacheFromStorage();
  return c ? c.rows : [];
}

// Tiny probe: returns the current (count, latest created_at) signature from
// the server. ~tens of bytes per call.
async function fetchSignature(): Promise<CachedShape['signature'] | null> {
  // `head: true` + `count: 'exact'` returns ONLY the count, no rows.
  const countPromise = supabase
    .from('global_leaderboard')
    .select('id', { count: 'exact', head: true });
  const latestPromise = supabase
    .from('global_leaderboard')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const [countRes, latestRes] = await Promise.all([countPromise, latestPromise]);
  if (countRes.error) {
    console.error('[globalLeaderboard] signature count failed:', countRes.error.message);
    return null;
  }
  if (latestRes.error) {
    console.error('[globalLeaderboard] signature latest failed:', latestRes.error.message);
    return null;
  }
  return {
    count: countRes.count ?? 0,
    latest: (latestRes.data?.created_at as string | undefined) ?? null,
  };
}

// Full pull of the top N. Used only when the signature says something changed.
async function fetchTop(limit: number = MAX_ENTRIES): Promise<GlobalEntry[] | null> {
  const { data, error } = await supabase
    .from('global_leaderboard')
    .select('id, name, score, level, created_at')
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[globalLeaderboard] fetch failed:', error.message);
    return null;
  }
  return (data || []) as GlobalEntry[];
}

// Check the server's signature against our cache. If unchanged, return the
// cached rows (zero extra reads). If changed (or no cache), pull the top N.
//
// Returns the rows that should now be displayed. On any network failure we
// fall back to whatever we have cached so the UI still renders.
export async function checkAndRefresh(
  limit: number = MAX_ENTRIES,
): Promise<GlobalEntry[]> {
  const cached = loadCacheFromStorage();
  const sig = await fetchSignature();
  if (!sig) {
    return cached ? cached.rows : [];
  }
  if (
    cached &&
    cached.signature.count === sig.count &&
    cached.signature.latest === sig.latest
  ) {
    // Server confirms nothing changed — reuse cache, no further reads.
    return cached.rows;
  }
  const rows = await fetchTop(limit);
  if (!rows) {
    return cached ? cached.rows : [];
  }
  saveCache(rows, sig);
  return rows;
}

// Returns true if `score` would land in the top `MAX_ENTRIES` of the given list.
export function qualifiesForGlobal(score: number, list: GlobalEntry[]): boolean {
  if (score <= 0) return false;
  if (list.length < MAX_ENTRIES) return true;
  return score > list[list.length - 1].score;
}

// Submit a new entry to the global leaderboard.
// On success, optimistically merges the row into the cache. The next
// `checkAndRefresh` call will reconcile with the canonical server state.
export async function submitGlobalScore(entry: {
  name: string;
  score: number;
  level?: number;
}): Promise<GlobalEntry | null> {
  const { data, error } = await supabase
    .from('global_leaderboard')
    .insert({
      name: entry.name,
      score: entry.score,
      level: entry.level ?? null,
    })
    .select('id, name, score, level, created_at')
    .single();
  if (error) {
    console.error('[globalLeaderboard] submit failed:', error.message);
    return null;
  }
  const row = data as GlobalEntry;
  // Optimistic merge — invalidates the signature so the next probe will
  // pull the canonical top N.
  const current = loadCacheFromStorage();
  const merged = topN([row, ...(current?.rows ?? [])]);
  saveCache(merged, {
    count: (current?.signature.count ?? 0) + 1,
    latest: row.created_at ?? new Date().toISOString(),
  });
  return row;
}
