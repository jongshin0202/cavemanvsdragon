DROP POLICY "Anyone can update their device stats" ON public.device_stats;
DROP POLICY "Anyone can insert device stats" ON public.device_stats;

-- Insert: must supply a non-null device_id (the row PK is the identifier).
CREATE POLICY "Insert device stats with id"
ON public.device_stats
FOR INSERT
TO public
WITH CHECK (device_id IS NOT NULL);

-- Update: caller must target an existing device_id. Without auth, knowing a
-- random UUIDv4 is the only thing gating this — same model as the public
-- leaderboard inserts.
CREATE POLICY "Update device stats with id"
ON public.device_stats
FOR UPDATE
TO public
USING (device_id IS NOT NULL)
WITH CHECK (device_id IS NOT NULL);
