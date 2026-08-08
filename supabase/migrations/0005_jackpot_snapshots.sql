-- jackpot_snapshots — daily history of each progressive game's next-jackpot
-- estimate, so the weekly digest and (Phase 3) news can eventually compute a
-- real trend instead of showing a single point-in-time snapshot (see the
-- NOTE in scripts/send_weekly_digest.py this replaces). One row per
-- game/day: written by calculate_stats.py right after it reads game_meta,
-- for every slug with a non-null nextJackpot that run. Starts accumulating
-- from today — there is no historical backfill, so a real "trend" needs a
-- few weeks of runs before it's meaningful.

begin;

create table if not exists public.jackpot_snapshots (
  id             bigint generated always as identity primary key,
  game_slug      text not null,
  captured_at    timestamptz not null default now(),
  captured_date  date not null default (now() at time zone 'America/Toronto')::date,
  amount         double precision not null
);
-- One snapshot per game per day — calculate_stats.py runs multiple times a
-- day across the three regional workflows (each sees the full game_meta
-- table), so this is what keeps re-runs from piling up duplicate rows.
create unique index if not exists idx_jackpot_snapshots_dedup
  on public.jackpot_snapshots (game_slug, captured_date);
create index if not exists idx_jackpot_snapshots_game
  on public.jackpot_snapshots (game_slug, captured_date desc);

alter table public.jackpot_snapshots enable row level security;
revoke all on public.jackpot_snapshots from anon, authenticated;
grant select, insert, update, delete on public.jackpot_snapshots to service_role;
grant usage, select on all sequences in schema public to service_role;

commit;
