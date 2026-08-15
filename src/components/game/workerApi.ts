import { Capacitor } from '@capacitor/core';

export type WorkerReadMode = 'supabase' | 'compare' | 'worker';

export interface WorkerLeaderboardEntry {
  rank: number;
  player_id: string;
  display_name: string;
  best_score: number;
  level: number | null;
  achieved_at: string;
  updated_at: string;
  source_platform: 'android' | 'ios' | 'web';
}

interface WorkerEnvelope<T> {
  ok: true;
  data: T;
  server_time: string;
}

const apiUrl = (import.meta.env.VITE_CVD_API_URL || '').trim().replace(/\/$/, '');

export function getWorkerReadMode(): WorkerReadMode {
  if (!apiUrl) return 'supabase';
  const configured = (import.meta.env.VITE_CVD_API_READ_MODE || 'compare').toLowerCase();
  return configured === 'worker' || configured === 'compare' ? configured : 'supabase';
}

export function workerWritesEnabled(): boolean {
  return Boolean(apiUrl) && import.meta.env.VITE_CVD_API_WRITES_ENABLED === 'true';
}

export function workerApiConfigured(): boolean {
  return Boolean(apiUrl);
}

export function sourcePlatform(): 'android' | 'ios' | 'web' {
  if (!Capacitor.isNativePlatform()) return 'web';
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
}

async function workerRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!apiUrl) throw new Error('VITE_CVD_API_URL is not configured');
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (init?.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers,
  });
  let body: WorkerEnvelope<T> | { ok: false; error?: { message?: string } } | null = null;
  try {
    body = await response.json() as typeof body;
  } catch {
    // The status and generic message below are safer than exposing response text.
  }
  if (!response.ok || !body || !body.ok) {
    const message = body && !body.ok ? body.error?.message : undefined;
    throw new Error(message || `Worker request failed (${response.status})`);
  }
  return body.data;
}

export async function fetchWorkerLeaderboard(limit: number): Promise<{
  entries: WorkerLeaderboardEntry[];
  total: number;
}> {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  return workerRequest(`/v1/leaderboard?limit=${safeLimit}&offset=0`);
}
