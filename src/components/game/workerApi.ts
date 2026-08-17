import { Capacitor } from '@capacitor/core';
import { getOrCreateDeviceId } from './deviceStats';

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

interface WorkerErrorEnvelope {
  ok: false;
  error?: { code?: string; message?: string };
}

interface StoredDeviceIdentity {
  player_id: string;
  display_name: string;
  credential: string;
  session_token: string;
  session_expires_at: string;
}

interface ScoreResult {
  improved: boolean;
  entry: WorkerLeaderboardEntry | null;
  submission_id: string;
}

interface DeviceRegistrationResult {
  player: { id: string; display_name: string };
  session: { token: string; expires_at: string };
  device_credentials: { player_id: string; credential: string };
  initial_score: ScoreResult;
}

interface DeviceSessionResult {
  player: { id: string; display_name: string };
  session: { token: string; expires_at: string };
}

const DEVICE_IDENTITY_KEY = 'cavemanVsDragon.workerDeviceIdentity.v1';
const apiUrl = (import.meta.env.VITE_CVD_API_URL || '').trim().replace(/\/$/, '');

export class WorkerApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'WorkerApiError';
  }
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

function deviceType(): 'phone' | 'tablet' | 'desktop' {
  const shortSide = typeof window === 'undefined'
    ? 0
    : Math.min(window.innerWidth, window.innerHeight);
  if (Capacitor.isNativePlatform()) return shortSide >= 600 ? 'tablet' : 'phone';
  const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  if (!touch) return 'desktop';
  return shortSide >= 600 ? 'tablet' : 'phone';
}

function platformMetadata(): Record<string, unknown> {
  const platform = sourcePlatform();
  const type = deviceType();
  return {
    installation_id: getOrCreateDeviceId(),
    source_platform: platform,
    web_source: platform === 'web'
      ? (type === 'desktop' ? 'desktop_web' : 'mobile_web')
      : undefined,
    device_type: type,
    app_version: import.meta.env.VITE_CVD_APP_VERSION || 'unknown',
    control_type: 'unknown',
  };
}

function loadDeviceIdentity(): StoredDeviceIdentity | null {
  try {
    const raw = localStorage.getItem(DEVICE_IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDeviceIdentity>;
    if (
      typeof parsed.player_id !== 'string' ||
      typeof parsed.display_name !== 'string' ||
      typeof parsed.credential !== 'string' ||
      typeof parsed.session_token !== 'string' ||
      typeof parsed.session_expires_at !== 'string'
    ) {
      return null;
    }
    return parsed as StoredDeviceIdentity;
  } catch {
    return null;
  }
}

function saveDeviceIdentity(identity: StoredDeviceIdentity): void {
  localStorage.setItem(DEVICE_IDENTITY_KEY, JSON.stringify(identity));
}

export function getWorkerPlayerName(): string | null {
  return loadDeviceIdentity()?.display_name ?? null;
}

async function workerRequest<T>(
  path: string,
  init?: RequestInit,
  bearerToken?: string,
): Promise<T> {
  if (!apiUrl) throw new Error('VITE_CVD_API_URL is not configured');
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (init?.body) headers.set('Content-Type', 'application/json');
  if (bearerToken) headers.set('Authorization', `Bearer ${bearerToken}`);
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers,
  });
  let body: WorkerEnvelope<T> | WorkerErrorEnvelope | null = null;
  try {
    body = await response.json() as typeof body;
  } catch {
    // Do not expose raw server responses, which could contain private data.
  }
  if (!response.ok || !body || !body.ok) {
    const error = body && !body.ok ? body.error : undefined;
    throw new WorkerApiError(
      error?.message || `Worker request failed (${response.status})`,
      response.status,
      error?.code,
    );
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

export async function checkWorkerPlayerNameAvailability(name: string): Promise<boolean> {
  if (!workerApiConfigured()) throw new Error('VITE_CVD_API_URL is not configured');
  const query = new URLSearchParams({ name });
  const result = await workerRequest<{ available: boolean; display_name: string }>(
    `/v1/device-players/name-availability?${query.toString()}`,
  );
  return result.available;
}

export function isWorkerNameUnavailableError(error: unknown): boolean {
  return error instanceof WorkerApiError && error.code === 'name_unavailable';
}

async function registerDeviceAndSubmit(entry: {
  name: string;
  score: number;
  level?: number;
  occurred_at: string;
}): Promise<ScoreResult> {
  const result = await workerRequest<DeviceRegistrationResult>(
    '/v1/device-players/register',
    {
      method: 'POST',
      body: JSON.stringify({
        ...platformMetadata(),
        name: entry.name,
        initial_score: entry.score,
        initial_level: entry.level ?? null,
        occurred_at: entry.occurred_at,
      }),
    },
  );
  saveDeviceIdentity({
    player_id: result.device_credentials.player_id,
    display_name: result.player.display_name,
    credential: result.device_credentials.credential,
    session_token: result.session.token,
    session_expires_at: result.session.expires_at,
  });
  return result.initial_score;
}

async function restoreDeviceSession(identity: StoredDeviceIdentity): Promise<StoredDeviceIdentity> {
  const result = await workerRequest<DeviceSessionResult>(
    '/v1/device-players/session',
    {
      method: 'POST',
      body: JSON.stringify({
        player_id: identity.player_id,
        credential: identity.credential,
        installation_id: getOrCreateDeviceId(),
      }),
    },
  );
  const refreshed: StoredDeviceIdentity = {
    ...identity,
    display_name: result.player.display_name,
    session_token: result.session.token,
    session_expires_at: result.session.expires_at,
  };
  saveDeviceIdentity(refreshed);
  return refreshed;
}

async function activeDeviceIdentity(): Promise<StoredDeviceIdentity | null> {
  const identity = loadDeviceIdentity();
  if (!identity) return null;
  const expiresAt = Date.parse(identity.session_expires_at);
  if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000) return identity;
  return restoreDeviceSession(identity);
}

async function postScore(
  identity: StoredDeviceIdentity,
  score: number,
  level: number | undefined,
  occurredAt: string,
): Promise<ScoreResult> {
  return workerRequest<ScoreResult>(
    '/v1/scores',
    {
      method: 'POST',
      body: JSON.stringify({
        ...platformMetadata(),
        score,
        level: level ?? null,
        occurred_at: occurredAt,
      }),
    },
    identity.session_token,
  );
}

export async function submitWorkerScore(entry: {
  name: string;
  score: number;
  level?: number;
}): Promise<ScoreResult> {
  if (!workerWritesEnabled()) throw new Error('Worker score writes are disabled');
  const occurredAt = new Date().toISOString();
  const identity = await activeDeviceIdentity();
  if (!identity) {
    return registerDeviceAndSubmit({ ...entry, occurred_at: occurredAt });
  }
  try {
    return await postScore(identity, entry.score, entry.level, occurredAt);
  } catch (error) {
    if (!(error instanceof WorkerApiError) || error.status !== 401) throw error;
    const refreshed = await restoreDeviceSession(identity);
    return postScore(refreshed, entry.score, entry.level, occurredAt);
  }
}
