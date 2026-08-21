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
const accountIdentityKey = 'cavemanVsDragon.workerAccountIdentity.v1';

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
      claim_state: 'login_required',
      requires_password: true,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const api = await loadApi();
    await expect(api.checkWorkerPlayerNameAvailability(' Jong ')).resolves.toMatchObject({
      available: false,
      claim_state: 'login_required',
      requires_password: true,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example/v1/device-players/name-availability?name=+Jong+',
    );
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit)?.method).toBeUndefined();
  });

  it('identifies a missing availability route for safe registration fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      ok: false,
      error: { code: 'not_found', message: 'Route not found.' },
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })));

    const api = await loadApi();

    try {
      await api.checkWorkerPlayerNameAvailability('JONG');
      throw new Error('Expected the availability request to fail');
    } catch (error) {
      expect(api.isWorkerNameAvailabilityEndpointMissing(error)).toBe(true);
      expect(api.isWorkerNameUnavailableError(error)).toBe(false);
    }
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
    const controls = await import('@/components/game/controlType');
    controls.recordGameplayControlInput('gamepad');
    const first = await api.submitWorkerScore({ name: 'JONG', score: 12000, level: 3 });
    expect(first.entry?.display_name).toBe('JONG');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example/v1/device-players/register');
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit)?.body)).control_type).toBe('gamepad');

    const stored = JSON.parse(localStorage.getItem(identityKey) || '{}');
    expect(stored).toMatchObject({
      player_id: 'player-1',
      display_name: 'JONG',
      credential: 'generated-device-credential',
      session_token: 'session-1',
    });

    controls.recordGameplayControlInput('touch');
    const second = await api.submitWorkerScore({ name: 'IGNORED', score: 15000, level: 4 });
    expect(second.entry?.display_name).toBe('JONG');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.example/v1/scores');
    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(secondInit.headers).get('Authorization')).toBe('Bearer session-1');
    const secondBody = JSON.parse(String(secondInit.body));
    expect(secondBody).not.toHaveProperty('name');
    expect(secondBody.control_type).toBe('mixed');
  });

  it('claims a password profile without persisting its password, then reuses its session', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok({
        player: { id: 'account-player-1', display_name: 'JONG' },
        session: { token: 'account-session-1', expires_at: '2099-01-01T00:00:00.000Z' },
        device_credentials: { player_id: 'account-player-1', credential: 'account-credential-1' },
      }))
      .mockResolvedValueOnce(ok({
        improved: true,
        submission_id: 'account-submission-1',
        entry: {
          rank: 1,
          player_id: 'account-player-1',
          display_name: 'JONG',
          best_score: 22000,
          level: 5,
          achieved_at: '2026-08-20T00:00:00.000Z',
          updated_at: '2026-08-20T00:00:00.000Z',
          source_platform: 'android',
        },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const api = await loadApi();
    await api.claimWorkerLeaderboardProfile({
      name: 'JONG',
      password: 'secret-password',
      recovery_email: 'jong@example.com',
    });

    const claimBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example/v1/accounts/register');
    expect(claimBody).toMatchObject({
      name: 'JONG',
      password: 'secret-password',
      recovery_email: 'jong@example.com',
      installation_id: 'test_installation_1234567890',
    });
    const storedRaw = localStorage.getItem(accountIdentityKey) || '';
    expect(storedRaw).not.toContain('secret-password');
    expect(JSON.parse(storedRaw)).toMatchObject({
      player_id: 'account-player-1',
      display_name: 'JONG',
      session_token: 'account-session-1',
      credential: 'account-credential-1',
    });

    await api.submitWorkerScore({ name: 'IGNORED', score: 22000, level: 5 });
    const scoreInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.example/v1/scores');
    expect(new Headers(scoreInit.headers).get('Authorization')).toBe('Bearer account-session-1');
  });

  it('logs an existing profile into a second installation and stores only its session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok({
      player: { id: 'account-player-1', display_name: 'JONG' },
      session: { token: 'pc-session', expires_at: '2099-01-01T00:00:00.000Z' },
      device_credentials: { player_id: 'account-player-1', credential: 'pc-credential' },
    })));
    const api = await loadApi();

    await api.loginWorkerLeaderboardProfile({ name: 'JONG', password: 'correct-password' });

    expect(api.getWorkerPlayerName()).toBe('JONG');
    const storedRaw = localStorage.getItem(accountIdentityKey) || '';
    expect(storedRaw).not.toContain('correct-password');
    expect(JSON.parse(storedRaw).session_token).toBe('pc-session');
  });

  it('upgrades the matching legacy device profile with its hidden credential', async () => {
    localStorage.setItem(identityKey, JSON.stringify({
      player_id: 'legacy-player',
      display_name: 'JONG',
      credential: 'legacy-secret',
      session_token: 'legacy-session',
      session_expires_at: '2099-01-01T00:00:00.000Z',
    }));
    const fetchMock = vi.fn().mockResolvedValueOnce(ok({
      player: { id: 'legacy-player', display_name: 'JONG' },
      session: { token: 'upgraded-session', expires_at: '2099-01-01T00:00:00.000Z' },
      device_credentials: { player_id: 'legacy-player', credential: 'upgraded-credential' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const api = await loadApi();

    expect(api.canUpgradeWorkerProfile('jong')).toBe(true);
    await api.upgradeWorkerLeaderboardProfile({
      name: 'JONG',
      password: 'new-password',
      recovery_email: 'jong@example.com',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example/v1/leaderboard-profiles/upgrade');
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toMatchObject({ name: 'JONG', credential: 'legacy-secret' });
    expect(localStorage.getItem(accountIdentityKey)).not.toContain('new-password');
  });

  it('refreshes an expired account session with its installation credential', async () => {
    localStorage.setItem(accountIdentityKey, JSON.stringify({
      player_id: 'account-player-1',
      display_name: 'JONG',
      credential: 'account-credential',
      session_token: 'expired-session',
      session_expires_at: '2020-01-01T00:00:00.000Z',
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok({
        player: { id: 'account-player-1', display_name: 'JONG' },
        session: { token: 'refreshed-account-session', expires_at: '2099-01-01T00:00:00.000Z' },
        device_credentials: { player_id: 'account-player-1', credential: 'refreshed-credential' },
      }))
      .mockResolvedValueOnce(ok({ improved: false, submission_id: 's-1', entry: null }));
    vi.stubGlobal('fetch', fetchMock);
    const api = await loadApi();

    await api.submitWorkerScore({ name: 'JONG', score: 100, level: 1 });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example/v1/leaderboard-profiles/session');
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({
      player_id: 'account-player-1', credential: 'account-credential',
    });
    expect(new Headers((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).get('Authorization'))
      .toBe('Bearer refreshed-account-session');
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

  it('recovers a profile with a personal answer without storing the answer', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok({ recovery_question: 'Where is my secret stone?' }))
      .mockResolvedValueOnce(ok({
        player: { id: 'account-player-1', display_name: 'JONG' },
        session: { token: 'recovery-session', expires_at: '2099-01-01T00:00:00.000Z' },
        device_credentials: { player_id: 'account-player-1', credential: 'recovery-credential' },
      }));
    vi.stubGlobal('fetch', fetchMock);
    const api = await loadApi();

    await expect(api.fetchWorkerRecoveryQuestion('JONG')).resolves.toBe('Where is my secret stone?');
    await api.recoverWorkerLeaderboardProfile({ name: 'JONG', answer: 'Behind the waterfall' });

    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.example/v1/leaderboard-profiles/recover-with-question');
    const stored = localStorage.getItem(accountIdentityKey) || '';
    expect(stored).toContain('recovery-credential');
    expect(stored).not.toContain('Behind the waterfall');
  });
});
