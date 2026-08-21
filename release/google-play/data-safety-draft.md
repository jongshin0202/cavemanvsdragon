# Google Play Data Safety draft

This is a source-based draft, not a legal determination. Reconcile it with the
deployed backend and every included SDK before submitting it in Play Console.

## Observed data handling

The game transmits the following over HTTPS to its leaderboard/telemetry
backend:

- Player-chosen public display name
- Score and reached level/round
- Random per-install/device identifier stored locally
- Device category and control/platform metadata
- Aggregated launch, round, and leaderboard-hit counters
- A generated device credential used to update that player's scores

The game also stores local scores, settings, identifiers, and cached leaderboard
data on the device.

## Proposed Play Console declarations

Review the exact Play Console taxonomy when completing the form:

- Data collected: **Yes**
- Data shared with third parties for independent purposes: **No**, assuming
  Cloudflare/Supabase act only as service providers — CONFIRM contracts/use
- Data encrypted in transit: **Yes**
- Account creation: no conventional email/password account; the game creates
  a device-bound leaderboard identity
- User IDs: player display name and generated player/device identifiers
- App activity: gameplay progress, score, launches, rounds, leaderboard hits,
  and control/platform metadata
- Purpose: app functionality, leaderboard operation, fraud/abuse prevention,
  and basic analytics
- Optionality: public name/score submission occurs when a qualifying player
  submits a leaderboard name; anonymous usage statistics occur automatically
  under the current implementation
- Deletion request mechanism: **CONFIRM support email/process before release**

## Required verification

- Confirm whether production still writes directly to Supabase in addition to
  the Cloudflare Worker.
- Confirm backend retention and backup-deletion periods.
- Confirm whether IP addresses or security logs are retained by infrastructure
  providers.
- Confirm that no advertising, attribution, crash-reporting, or analytics SDK
  adds undeclared collection.

