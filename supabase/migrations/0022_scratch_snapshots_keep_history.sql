-- ---------------------------------------------------------------------------
-- scratch_snapshots must outlive the games rows it describes.
--
-- 0007 gave it a foreign key to games ... ON DELETE CASCADE. Every scratch
-- refresh deletes and re-inserts its agency's games (db.replace_scratch_games),
-- so the cascade wiped every past snapshot each day and the table only ever
-- held today. scratch_alerts.py diffs today against the latest PRIOR
-- snapshot, found none, and so never sent a "top prize claimed", "new
-- ticket" or "rank drop" alert. Found 2026-10-09.
--
-- History is the point of this table (and a game that leaves the agency's
-- list should keep its trail), so the foreign key goes. Nothing before
-- 2026-10-09 survives to recover.
-- ---------------------------------------------------------------------------
alter table public.scratch_snapshots
  drop constraint if exists scratch_snapshots_game_number_agency_fkey;

notify pgrst, 'reload schema';
