// Global leaderboard backed by Lovable Cloud (Supabase).
// Shared across ALL platforms (web preview, Vercel, APK, mobile, PC).
import { supabase } from '@/integrations/supabase/client';
import { MAX_ENTRIES } from './leaderboard';

export interface GlobalEntry {
  id?: string;
  name: string;
  score: number;
  level?: number;
  created_at?: string;
}

// Fetch the top N (default MAX_ENTRIES = 20) global scores, highest first.
export async function fetchGlobalTop(limit: number = MAX_ENTRIES): Promise<GlobalEntry[]> {
  const { data, error } = await supabase
    .from('global_leaderboard')
    .select('id, name, score, level, created_at')
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[globalLeaderboard] fetch failed:', error.message);
    return [];
  }
  return (data || []) as GlobalEntry[];
}

// Returns true if `score` would land in the top `MAX_ENTRIES` of the given list.
export function qualifiesForGlobal(score: number, list: GlobalEntry[]): boolean {
  if (score <= 0) return false;
  if (list.length < MAX_ENTRIES) return true;
  return score > list[list.length - 1].score;
}

// Submit a new entry to the global leaderboard.
// Returns the inserted row, or null on failure (network / RLS rejection).
export async function submitGlobalScore(entry: { name: string; score: number; level?: number }): Promise<GlobalEntry | null> {
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
  return data as GlobalEntry;
}
