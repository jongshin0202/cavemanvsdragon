-- ============================================================
-- device_stats: per-device anonymous usage counters
-- ============================================================
CREATE TABLE public.device_stats (
  device_id uuid PRIMARY KEY,
  launches integer NOT NULL DEFAULT 0,
  global_hits integer NOT NULL DEFAULT 0,
  rounds_total integer NOT NULL DEFAULT 0,
  -- Rolling list of rounds played per launch for the most recent sessions
  -- (client trims to ~50 entries before sending).
  last_rounds_per_launch jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_flush_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.device_stats ENABLE ROW LEVEL SECURITY;

-- Anyone can insert a row for any device_id (the client picks its own UUID).
CREATE POLICY "Anyone can insert device stats"
ON public.device_stats
FOR INSERT
TO public
WITH CHECK (true);

-- Anyone can update the row matching the device_id they pass.
-- (No auth in this game; the device_id is the only identifier.)
CREATE POLICY "Anyone can update their device stats"
ON public.device_stats
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- IMPORTANT: no public SELECT policy. Only the service role (admin via
-- cloud panel / chat) can read device_stats. This prevents one player
-- from enumerating other devices' counters.

-- ============================================================
-- app_config: single-row key/value config controlled by admin
-- ============================================================
CREATE TABLE public.app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Public can READ config values (clients need flush_every_n_launches).
CREATE POLICY "Anyone can read app config"
ON public.app_config
FOR SELECT
TO public
USING (true);

-- No public INSERT/UPDATE/DELETE policy → only service role (admin) can
-- modify config.

-- Seed the flush cadence parameter. 5 = flush every 5 launches.
-- Set to 0 to disable cloud flushing entirely (clients accumulate locally).
INSERT INTO public.app_config (key, value)
VALUES ('flush_every_n_launches', '5'::jsonb);
