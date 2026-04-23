-- Global leaderboard table — shared across all platforms
CREATE TABLE public.global_leaderboard (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  level INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast top-N queries
CREATE INDEX idx_global_leaderboard_score_desc ON public.global_leaderboard (score DESC, created_at ASC);

-- Enable RLS
ALTER TABLE public.global_leaderboard ENABLE ROW LEVEL SECURITY;

-- Anyone (anon + authenticated) can read all scores
CREATE POLICY "Anyone can view global leaderboard"
ON public.global_leaderboard
FOR SELECT
USING (true);

-- Anyone can submit a score with reasonable constraints (anonymous play allowed)
CREATE POLICY "Anyone can submit a score"
ON public.global_leaderboard
FOR INSERT
WITH CHECK (
  score > 0
  AND score < 100000000
  AND length(name) BETWEEN 1 AND 10
  AND name ~ '^[A-Za-z0-9 ]+$'
);

-- No UPDATE or DELETE policies → only service_role (admin via Cloud panel) can modify/delete