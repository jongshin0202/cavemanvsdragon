-- Add the leaderboard table to the supabase_realtime publication so clients
-- can subscribe to INSERT events instead of polling.
ALTER PUBLICATION supabase_realtime ADD TABLE public.global_leaderboard;

-- REPLICA IDENTITY FULL ensures realtime payloads include all columns
-- (we only need INSERTs, but this makes the row payload complete).
ALTER TABLE public.global_leaderboard REPLICA IDENTITY FULL;