export interface LeaderboardEntry {
  // Display name, up to 10 chars (A-Z, 0-9, space). Older saves may have only `initials`.
  name?: string;
  initials: string; // legacy 3-letter initials; kept for backward compat + canvas fallback
  score: number;
  date: string; // ISO
  level?: number; // last level reached (optional for backward compat)
}

const STORAGE_KEY = 'cavemanVsDragon.topScores.v1';
export const MAX_ENTRIES = 20;

export function loadScores(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.initials === 'string' && typeof e.score === 'number' && typeof e.date === 'string')
      .map((e) => ({
        ...e,
        name: typeof e.name === 'string' ? e.name : undefined,
        level: typeof e.level === 'number' ? e.level : undefined,
      }))
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

// Convenience: best display string for an entry (name preferred, else initials)
export function entryDisplayName(e: LeaderboardEntry): string {
  return (e.name && e.name.trim()) || e.initials || '---';
}

export function saveScores(entries: LeaderboardEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // ignore quota / privacy errors
  }
}

export function qualifiesForTop(score: number, scores: LeaderboardEntry[] = loadScores()): boolean {
  if (score <= 0) return false;
  if (scores.length < MAX_ENTRIES) return true;
  return score > scores[scores.length - 1].score;
}

export function insertScore(entry: LeaderboardEntry, scores: LeaderboardEntry[] = loadScores()): LeaderboardEntry[] {
  const next = [...scores, entry].sort((a, b) => b.score - a.score).slice(0, MAX_ENTRIES);
  saveScores(next);
  return next;
}

export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}
