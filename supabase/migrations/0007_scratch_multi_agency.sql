-- Extend the scratch/instant-game schema (0001_init.sql) from OLG-only to
-- all five Canadian lottery agencies (OLG, BCLC, WCLC, ALC, Loto-Québec).
--
-- CRITICAL FIX bundled into this migration: `games.game_number` was the sole
-- primary key, and prize_tiers referenced it via a single-column FK. Game
-- numbers are agency-native codes (OLG: 4-digit, BCLC: gameNumber+prodCode,
-- WCLC: 5-digit, ALC: 4-digit, Loto-Québec: lel_product_code) with no
-- cross-agency coordination — a coincidental collision between two agencies'
-- game numbers would have silently merged two unrelated games into one row.
-- The PK becomes (game_number, agency); prize_tiers gains an `agency` column
-- and its FK becomes composite. scripts/scrape_olg.py's full-refresh
-- (`db.delete_all("games", ...)`, unscoped) is ALSO a bundled bug fix
-- target: it wipes the WHOLE table, which would delete every other agency's
-- games on every OLG scrape. Every adapter must now delete only its own
-- agency's rows (`db.delete_where("games", "agency", "OLG")` etc.) — see the
-- updated scripts.

begin;

-- ---------------------------------------------------------------------------
-- games: add agency/province/launch_date, backfill existing OLG rows, then
-- switch the primary key to (game_number, agency).
-- ---------------------------------------------------------------------------
alter table public.games add column if not exists agency text;
alter table public.games add column if not exists province text;
alter table public.games add column if not exists launch_date text;

update public.games set agency = 'OLG', province = 'ontario' where agency is null;

alter table public.games alter column agency set not null;
alter table public.games alter column province set not null;

-- prize_tiers needs the same `agency` column before the composite FK can be built.
alter table public.prize_tiers add column if not exists agency text;
update public.prize_tiers pt set agency = g.agency
  from public.games g where g.game_number = pt.game_number and pt.agency is null;
alter table public.prize_tiers alter column agency set not null;

-- Drop the FK first — it depends on the old single-column PK's index, so
-- the PK can't be dropped while it's still referenced.
alter table public.prize_tiers drop constraint if exists prize_tiers_game_number_fkey;

-- Swap games' PK: drop the old single-column PK, add the composite one.
alter table public.games drop constraint games_pkey;
alter table public.games add constraint games_pkey primary key (game_number, agency);

-- Rebuild prize_tiers' FK against the new composite key.
alter table public.prize_tiers
  add constraint prize_tiers_game_fkey
  foreign key (game_number, agency) references public.games(game_number, agency)
  on delete cascade;

create index if not exists idx_games_agency on public.games(agency);
create index if not exists idx_tiers_agency on public.prize_tiers(agency);

-- ---------------------------------------------------------------------------
-- scratch_snapshots — daily per-game snapshot of the full tier-level prize
-- state, for future "top prize just claimed" alerts and Value Score trend
-- charts (Lottizen Plus). Distinct from scratch_rank_snapshots (added in the
-- Lottizen Pro migration, 0006): that table stores lightweight rank/score
-- history for the ranking-change feature; this one stores the full
-- prize-tier JSON so a future feature can detect exactly which tier
-- transitioned to remaining=0 and when, not just that the aggregate score
-- moved. Both are written by calculate_rankings.py; kept as two tables
-- rather than merged so each stays cheap to query for its own purpose.
-- ---------------------------------------------------------------------------
create table if not exists public.scratch_snapshots (
  id                      bigint generated always as identity primary key,
  game_number             text not null,
  agency                  text not null,
  captured_at             timestamptz not null default now(),
  captured_date           date not null default (now() at time zone 'America/Toronto')::date,
  prizes_remaining_json   jsonb not null,
  foreign key (game_number, agency) references public.games(game_number, agency) on delete cascade
);
create unique index if not exists idx_scratch_snapshots_dedup
  on public.scratch_snapshots (game_number, agency, captured_date);
create index if not exists idx_scratch_snapshots_game
  on public.scratch_snapshots (game_number, agency, captured_date desc);

alter table public.scratch_snapshots enable row level security;
revoke all on public.scratch_snapshots from anon, authenticated;
grant select, insert, update, delete on public.scratch_snapshots to service_role;
grant usage, select on all sequences in schema public to service_role;

commit;
