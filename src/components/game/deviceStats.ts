// Anonymous per-device usage stats with cost-aware batching.
//
// What we track (per device, identified by a UUID stored in localStorage):
//   • launches            — how many times the player started a play session
//   • global_hits         — how many times they made the GLOBAL leaderboard
//   • rounds_total        — total rounds played across all launches
//   • last_rounds_per_launch — rolling list of "rounds played" per recent launch
//
// Cost model:
//   All counters are incremented LOCALLY for free. We only talk to the cloud
//   in batches, controlled by the admin-only `flush_every_n_launches` value
//   in `app_config`:
//     • N > 0  → flush after every N launches (a single upsert per flush).
//     • N == 0 → batching disabled; accumulate locally indefinitely until the
//                admin sets N > 0, then the next launch will flush everything.
//
//   The config value is read from the cloud at most once per launch (one tiny
//   row), and we cache it in localStorage so even that read is cheap.
import { supabase } from '@/integrations/supabase/client';

const DEVICE_ID_KEY = 'cavemanVsDragon.deviceId.v1';
const PENDING_KEY = 'cavemanVsDragon.statsPending.v1';
const CONFIG_CACHE_KEY = 'cavemanVsDragon.flushEvery.v1';

const ROUNDS_HISTORY_CAP = 50;

interface PendingStats {
  // Counters accumulated locally since the last successful flush.
  launches: number;
  globalHits: number;
  roundsTotal: number;
  // Rounds played per launch since last flush, in order.
  roundsPerLaunch: number[];
  // Rounds count for the CURRENT in-progress launch (not yet committed).
  currentLaunchRounds: number;
  // Number of launches recorded since the last successful flush.
  launchesSinceFlush: number;
}

function emptyPending(): PendingStats {
  return {
    launches: 0,
    globalHits: 0,
    roundsTotal: 0,
    roundsPerLaunch: [],
    currentLaunchRounds: 0,
    launchesSinceFlush: 0,
  };
}

// ---------- Local storage helpers ----------

function loadPending(): PendingStats {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return emptyPending();
    const parsed = JSON.parse(raw) as Partial<PendingStats>;
    return { ...emptyPending(), ...parsed };
  } catch {
    return emptyPending();
  }
}

function savePending(p: PendingStats): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    // ignore quota / privacy errors
  }
}

function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
  } catch { /* ignore */ }
  // crypto.randomUUID exists in all evergreen browsers + Capacitor WebView.
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  try { localStorage.setItem(DEVICE_ID_KEY, id); } catch { /* ignore */ }
  return id;
}

// ---------- Config (flush cadence) ----------

let cachedFlushEvery: number | null = null;

function readCachedFlushEvery(): number | null {
  if (cachedFlushEvery !== null) return cachedFlushEvery;
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) {
      cachedFlushEvery = n;
      return n;
    }
  } catch { /* ignore */ }
  return null;
}

function writeCachedFlushEvery(n: number): void {
  cachedFlushEvery = n;
  try { localStorage.setItem(CONFIG_CACHE_KEY, String(n)); } catch { /* ignore */ }
}

// One small read per launch. Falls back to whatever we cached previously,
// or to a sensible default if we've never reached the server.
async function fetchFlushEvery(): Promise<number> {
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'flush_every_n_launches')
    .maybeSingle();
  if (error || !data) {
    const cached = readCachedFlushEvery();
    return cached ?? 5;
  }
  // value is jsonb; could be number or string-encoded number.
  const raw = data.value;
  const n = typeof raw === 'number' ? raw : Number(raw);
  const safe = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 5;
  writeCachedFlushEvery(safe);
  return safe;
}

// ---------- Public API ----------

// Call once when the user starts a play session (presses Start).
// Increments local counters and, if the cadence permits, flushes to the cloud.
export async function recordLaunchAndMaybeFlush(): Promise<void> {
  const pending = loadPending();
  // If there was a previous in-progress launch (e.g. user closed the tab
  // mid-game), commit its round count now so we don't lose it.
  if (pending.currentLaunchRounds > 0) {
    pending.roundsPerLaunch.push(pending.currentLaunchRounds);
    if (pending.roundsPerLaunch.length > ROUNDS_HISTORY_CAP) {
      pending.roundsPerLaunch.splice(0, pending.roundsPerLaunch.length - ROUNDS_HISTORY_CAP);
    }
    pending.currentLaunchRounds = 0;
  }
  pending.launches += 1;
  pending.launchesSinceFlush += 1;
  savePending(pending);

  // One small config read per launch.
  const flushEvery = await fetchFlushEvery();
  if (flushEvery > 0 && pending.launchesSinceFlush >= flushEvery) {
    await flushNow();
  }
}

// Call when the player advances to the next round within the current launch.
export function recordRound(): void {
  const pending = loadPending();
  pending.currentLaunchRounds += 1;
  pending.roundsTotal += 1;
  savePending(pending);
}

// Call when the player's score lands on the GLOBAL leaderboard.
export function recordGlobalHit(): void {
  const pending = loadPending();
  pending.globalHits += 1;
  savePending(pending);
}

// Send all accumulated deltas to the cloud in a single upsert.
// On success, local counters are reset (the in-progress launch's rounds are
// preserved so we don't lose them mid-session).
async function flushNow(): Promise<void> {
  const deviceId = getOrCreateDeviceId();
  const pending = loadPending();

  // Read existing row so we can add deltas (no DB-side increment without RPC).
  // This is one tiny row.
  const { data: existing, error: readErr } = await supabase
    .from('device_stats')
    .select('launches, global_hits, rounds_total, last_rounds_per_launch')
    .eq('device_id', deviceId)
    .maybeSingle();
  if (readErr) {
    console.error('[deviceStats] read failed:', readErr.message);
    return;
  }

  const prevHistory = Array.isArray(existing?.last_rounds_per_launch)
    ? (existing!.last_rounds_per_launch as number[])
    : [];
  const mergedHistory = [...prevHistory, ...pending.roundsPerLaunch].slice(-ROUNDS_HISTORY_CAP);

  const upsertRow = {
    device_id: deviceId,
    launches: (existing?.launches ?? 0) + pending.launches,
    global_hits: (existing?.global_hits ?? 0) + pending.globalHits,
    rounds_total: (existing?.rounds_total ?? 0) + pending.roundsTotal,
    last_rounds_per_launch: mergedHistory,
    last_flush_at: new Date().toISOString(),
  };

  const { error: writeErr } = await supabase
    .from('device_stats')
    .upsert(upsertRow, { onConflict: 'device_id' });
  if (writeErr) {
    console.error('[deviceStats] flush failed:', writeErr.message);
    return;
  }

  // Reset everything we just sent. Preserve in-progress launch's rounds.
  const after: PendingStats = {
    launches: 0,
    globalHits: 0,
    roundsTotal: 0,
    roundsPerLaunch: [],
    currentLaunchRounds: pending.currentLaunchRounds,
    launchesSinceFlush: 0,
  };
  savePending(after);
}
