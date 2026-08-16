# Android new-server migration

Branch: `AndroidAPK-NewServer1`

Server repository: `jongshin0202/cavemanvsdragon-server`

## GitHub Actions variables

Configure these repository variables before building a migration APK:

| Variable | Initial development value | Purpose |
| --- | --- | --- |
| `CVD_API_URL` | Development Worker origin, with no trailing slash | Enables Worker traffic |
| `CVD_API_READ_MODE` | `compare` | Keeps Supabase visible while comparing Worker order/count |
| `CVD_API_WRITES_ENABLED` | `false` | Prevents premature Worker score writes |
| `CVD_APP_VERSION` | Current Android release version | Server-side source metadata |

If `CVD_API_URL` is empty, the APK remains Supabase-only regardless of the
requested read mode. No server URL or credential is hardcoded into source.

## Read rollout

1. Deploy and migrate the development Worker and both development D1 databases.
2. Set `CVD_API_URL` and leave `CVD_API_READ_MODE=compare`.
3. Build the APK from this branch and inspect the parallel-read diagnostics.
   Diagnostics contain only row counts and an ordering-match boolean.
4. Reconcile migrated accounts/scores until counts and visible ordering agree.
5. Set `CVD_API_READ_MODE=worker` for the development APK smoke test.

Worker mode falls back to the last locally cached global leaderboard if the API
is offline. It does not silently write to either server.

## Write rollout

`CVD_API_WRITES_ENABLED` must stay `false` until the player-account UI is wired
to registration/login and the score-write tests pass. The server requires an
opaque player session for `/v1/scores`; Android must never embed an admin token
or database credential.

After authenticated writes, analytics batching, sharing, and referral capture
are integrated and tested, remove Supabase only in a later release.
