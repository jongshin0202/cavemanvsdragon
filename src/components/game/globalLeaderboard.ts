// Global leaderboard backed by Lovable Cloud (Supabase).
// Shared across ALL platforms (web preview, Vercel, APK, mobile, PC).
//
// Cost-optimization strategy:
//   1. localStorage cache with a freshness TTL (default 60s) so repeat
//      mounts/screens reuse the in-memory list instead of refetching.
//   2. Single shared in-memory cache + subscriber list — multiple components
//      asking for the leaderboard share one network call.
//   3. A Realtime subscription on `global_leaderboard` replaces polling:
//      whenever any device anywhere inserts a new score, every connected
//      client receives the row and merges it locally. Zero extra reads.
//   4. The realtime channel is started lazily (first subscriber) and torn
//      down when the page is hidden, then restarted on visibility — so
//      backgrounded tabs/apps don't keep an open WebSocket.
//   5. After a local insert we OPTIMISTICALLY merge the row and skip the
//      refetch. Realtime echoes the canonical row shortly after.
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { MAX_ENTRIES } from './leaderboard';

export interface GlobalEntry {
  id?: string;
  name: string;
  score: number;
  level?: number;
  created_at?: string;
}

const CACHE_KEY = 'cavemanVsDragon.globalTop.v1';
const CACHE_TTL_MS = 60_000; // refetch at most once per minute

interface CachedShape {
  fetchedAt: number;
  rows: GlobalEntry[];
}

// In-memory cache (shared across all callers in this tab).
let memCache: CachedShape | null = null;
// Subscribers that want to be notified when the leaderboard changes
// (realtime insert, refetch, or optimistic merge).
const subscribers = new Set<(rows: GlobalEntry[]) => void>();

// Realtime channel state (lazy + visibility-aware)
let channel: RealtimeChannel | null = null;
let channelRefcount = 0;
let visibilityHooked = false;

// ---------- Cache helpers ----------

function loadCacheFromStorage(): CachedShape | null {
  if (memCache) return memCache;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedShape;
    if (!parsed || !Array.isArray(parsed.rows) || typeof parsed.fetchedAt !== 'number') return null;
    memCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(rows: GlobalEntry[]): void {
  memCache = { fetchedAt: Date.now(), rows };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(memCache));
  } catch {
    // ignore quota / privacy errors
  }
  for (const cb of subscribers) cb(rows);
}

function isFresh(c: CachedShape | null): boolean {
  if (!c) return false;
  return Date.now() - c.fetchedAt < CACHE_TTL_MS;
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

// Fetch the top N global scores. Reuses cache while fresh; otherwise hits
// the server once. Pass `force = true` to bypass the TTL (rarely needed —
// realtime keeps us in sync).
export async function fetchGlobalTop(
  limit: number = MAX_ENTRIES,
  force: boolean = false,
): Promise<GlobalEntry[]> {
  const cached = loadCacheFromStorage();
  if (!force && isFresh(cached)) {
    return cached!.rows;
  }
  const { data, error } = await supabase
    .from('global_leaderboard')
    .select('id, name, score, level, created_at')
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[globalLeaderboard] fetch failed:', error.message);
    // Fall back to whatever we have cached so the UI still shows something.
    return cached ? cached.rows : [];
  }
  const rows = (data || []) as GlobalEntry[];
  saveCache(rows);
  return rows;
}

// Returns true if `score` would land in the top `MAX_ENTRIES` of the given list.
export function qualifiesForGlobal(score: number, list: GlobalEntry[]): boolean {
  if (score <= 0) return false;
  if (list.length < MAX_ENTRIES) return true;
  return score > list[list.length - 1].score;
}

// Submit a new entry to the global leaderboard.
// On success, optimistically merges the row into the cache and notifies
// subscribers. Realtime will echo the canonical row shortly after.
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
  mergeRow(row);
  return row;
}

// Merge a single row into the cache (used by realtime + optimistic submit).
function mergeRow(row: GlobalEntry): void {
  const current = loadCacheFromStorage()?.rows ?? [];
  const merged = topN([row, ...current]);
  saveCache(merged);
}

// ---------- Subscribe + Realtime ----------

function ensureChannel(): void {
  if (channel) return;
  channel = supabase
    .channel('global_leaderboard_changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'global_leaderboard' },
      (payload) => {
        const row = payload.new as GlobalEntry;
        if (row && typeof row.score === 'number' && typeof row.name === 'string') {
          // Only bother merging if the new row could plausibly be in the top N.
          const current = loadCacheFromStorage()?.rows ?? [];
          if (current.length < MAX_ENTRIES || row.score > current[current.length - 1].score) {
            mergeRow(row);
          }
        }
      },
    )
    .subscribe();
}

function teardownChannel(): void {
  if (!channel) return;
  supabase.removeChannel(channel);
  channel = null;
}

function hookVisibilityOnce(): void {
  if (visibilityHooked || typeof document === 'undefined') return;
  visibilityHooked = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Tear down the WebSocket so background tabs / minimised apps cost nothing.
      teardownChannel();
    } else if (channelRefcount > 0) {
      // Returning to foreground: re-open and pull a fresh snapshot once
      // (in case we missed inserts while offline).
      ensureChannel();
      fetchGlobalTop(MAX_ENTRIES, true).catch(() => { /* logged in fetch */ });
    }
  });
}

// Subscribe to leaderboard updates. The callback fires whenever the cached
// list changes (refetch, optimistic insert, or realtime echo).
// Returns an unsubscribe function. The realtime channel is started on the
// first subscriber and torn down when the last one unsubscribes.
export function subscribeGlobal(cb: (rows: GlobalEntry[]) => void): () => void {
  subscribers.add(cb);
  channelRefcount += 1;
  hookVisibilityOnce();
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
    ensureChannel();
  }
  // Push current cache immediately so the caller has something to render.
  const cached = loadCacheFromStorage();
  if (cached) cb(cached.rows);
  return () => {
    subscribers.delete(cb);
    channelRefcount = Math.max(0, channelRefcount - 1);
    if (channelRefcount === 0) teardownChannel();
  };
}
