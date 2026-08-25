-- Real "last actually changed" tracking for scratch games, for sitemap
-- lastmod. `games.scraped_at` updates every single day regardless of
-- whether the prize-tier data changed — using it as sitemap lastmod is
-- exactly the kind of always-different-but-meaningless signal that gets a
-- site's lastmod ignored site-wide by crawlers. `data_changed_at` instead
-- only advances when a game's tier data (amount/label/total/remaining per
-- tier) genuinely differs from what was there before — see
-- scripts/db.py's replace_scratch_games(), which now diffs against the
-- prior state before overwriting and carries the old timestamp forward
-- when nothing changed.
--
-- Backfilled to scraped_at for existing rows (the only timestamp available
-- for data written before this column existed) — the first scrape AFTER
-- this migration will establish real change-tracking going forward.

begin;

alter table public.games add column if not exists data_changed_at timestamptz;
update public.games set data_changed_at = scraped_at::timestamptz where data_changed_at is null;
alter table public.games alter column data_changed_at set not null;

commit;
