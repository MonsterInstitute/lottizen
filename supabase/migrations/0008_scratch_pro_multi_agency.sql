-- Lottizen Pro's scratch_favourites and scratch_rank_snapshots (from
-- 0006_lottizen_pro.sql) were built when only OLG existed, keyed by a bare
-- `game_slug` with no agency dimension. Now that 5 agencies share one slug
-- namespace, that's a real bug, not a hypothetical one: cross-agency slug
-- collisions are already present in production data (e.g. OLG "diamond-7s"
-- vs ALC "diamond-7s", "elite" in OLG/ALC/WCLC, etc. — 18 distinct slugs
-- collide across agencies as of this migration). Without this fix, a user
-- favouriting an Ontario ticket could silently also match/overwrite an
-- Atlantic ticket's snapshot row with the same slug.
--
-- All existing rows predate multi-agency and are 100% OLG — backfilled
-- accordingly, same pattern as games/prize_tiers in 0007.

begin;

alter table public.scratch_favourites add column if not exists agency text;
update public.scratch_favourites set agency = 'OLG' where agency is null;
alter table public.scratch_favourites alter column agency set not null;

alter table public.scratch_favourites drop constraint if exists scratch_favourites_pkey;
alter table public.scratch_favourites
  add constraint scratch_favourites_pkey primary key (subscriber_id, agency, game_slug);

alter table public.scratch_rank_snapshots add column if not exists agency text;
update public.scratch_rank_snapshots set agency = 'OLG' where agency is null;
alter table public.scratch_rank_snapshots alter column agency set not null;

drop index if exists idx_scratch_rank_snapshots_dedup;
drop index if exists idx_scratch_rank_snapshots_game;
create unique index if not exists idx_scratch_rank_snapshots_dedup
  on public.scratch_rank_snapshots (agency, game_slug, captured_date);
create index if not exists idx_scratch_rank_snapshots_game
  on public.scratch_rank_snapshots (agency, game_slug, captured_date desc);

commit;
