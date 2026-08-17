import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/game/deviceStats', () => ({
  getOrCreateDeviceId: () => 'test_installation_1234567890',
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
}));

const identityKey = 'cavemanVsDragon.workerDeviceIdentity.v1';

function ok(data: unknown): Response {
  return new Response(JSON.stringify({
    ok: true,
    data,
    server_time: '2026-08-16T00:00:00.000Z',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function loadApi() {
  vi.resetModules();
  vi.stubEnv('VITE_CVD_API_URL', 'https://api.example');
  vi.stubEnv('VITE_CVD_API_WRITES_ENABLED', 'true');
  vi.stubEnv('VITE_CVD_APP_VERSION', '1.1.0-test');
  return import('@/components/game/workerApi');
}

describe('invisible Worker device identity', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('checks case-insensitive name availability before first registration', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok({
      available: false,
      display_name: 'JONG',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const api = await loadApi();
    await expect(api.checkWorkerPlayerNameAvailability(' Jong ')).resolves.toBe(false);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example/v1/device-players/name-availability?name=+Jong+',
    );
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit)?.method).toBeUndefined();
  });

  it('registers once, stores the hidden credential, and reuses the bearer session', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok({
        player: { id: 'player-1', display_name: 'JONG' },
        session: { token: 'session-1', expires_at: '2099-01-01T00:00:00.000Z' },
        device_credentials: { player_id: 'player-1', credential: 'generated-device-credential' },
        initial_score: {
          improved: true,
          submission_id: 'submission-1',
          entry: {
            rank: 1,
            player_id: 'player-1',
            display_name: 'JONG',
            best_score: 12000,
            level: 3,
            achieved_at: '2026-08-16T00:00:00.000Z',
            updated_at: '2026-08-16T00:00:00.000Z',
            source_platform: 'android',
          },
        },
      }))
      .mockResolvedValueOnce(ok({
        improved: true,
        submission_id: 'submission-2',
        entry: {
          rank: 1,
          player_id: 'player-1',
          display_name: 'JONG',
          best_score: 15000,
          level: 4,
          achieved_at: '2026-08-16T00:01:00.000Z',
          updated_at: '2026-08-16T00:01:00.000Z',
          source_platform: 'android',
        },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const api = await loadApi();
    const first = await api.submitWorkerScore({ name: 'JONG', score: 12000, level: 3 });
    expect(first.entry?.display_name).toBe('JONG');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example/v1/device-players/register');

    const stored = JSON.parse(localStorage.getItem(identityKey) || '{}');
    expect(stored).toMatchObject({
      player_id: 'player-1',
      display_name: 'JONG',
      credential: 'generated-device-credential',
      session_token: 'session-1',
    });

    const second = await api.submitWorkerScore({ name: 'IGNORED', score: 15000, level: 4 });
    expect(second.entry?.display_name).toBe('JONG');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.example/v1/scores');
    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(secondInit.headers).get('Authorization')).toBe('Bearer session-1');
    expect(JSON.parse(String(secondInit.body))).not.toHaveProperty('name');
  });

  it('restores an expired session silently before submitting a score', async () => {
    localStorage.setItem(identityKey, JSON.stringify({
      player_id: 'player-1',
      display_name: 'JONG',
      credential: 'generated-device-credential',
      session_token: 'expired-session',
      session_expires_at: '2020-01-01T00:00:00.000Z',
    }));

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok({
        player: { id: 'player-1', display_name: 'JONG' },
        session: { token: 'restored-session', expires_at: '2099-01-01T00:00:00.000Z' },
      }))
      .mockResolvedValueOnce(ok({
        improved: true,
        submission_id: 'submission-3',
        entry: {
          rank: 1,
          player_id: 'player-1',
          display_name: 'JONG',
          best_score: 18000,
          level: 5,
          achieved_at: '2026-08-16T00:02:00.000Z',
          updated_at: '2026-08-16T00:02:00.000Z',
          source_platform: 'android',
        },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const api = await loadApi();
    await api.submitWorkerScore({ name: 'JONG', score: 18000, level: 5 });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example/v1/device-players/session');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.example/v1/scores');
    const scoreInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(scoreInit.headers).get('Authorization')).toBe('Bearer restored-session');
  });
});
