-- ---------------------------------------------------------------------------
-- New-ticket calendar.
--
-- scratch_launch_dates: launch dates that aren't in the prize feeds, cached so
-- they're fetched once per game rather than every day (games rows are
-- rebuilt each refresh). WCLC: the launch timestamp on its Active Tickets
-- page. (OLG's product pages show an "EFFECTIVE DATE", but it is the date of
-- the game-conditions document — 2026-02-17 on all 44 pages checked — not a
-- launch date, so OLG has none.)
-- scratch_coming_soon: games an agency has announced but not launched (WCLC's
-- "Coming Soon" tab), replaced on every refresh.
-- ---------------------------------------------------------------------------
create table if not exists public.scratch_launch_dates (
  agency       text not null,
  game_number  text not null,
  launch_date  date not null,
  source       text not null,
  primary key (agency, game_number)
);
create table if not exists public.scratch_coming_soon (
  agency       text not null,
  game_number  text not null,
  name         text not null,
  price        numeric not null,
  launch_date  date,
  captured_on  date not null,
  primary key (agency, game_number)
);
alter table public.scratch_launch_dates enable row level security;
alter table public.scratch_coming_soon enable row level security;
revoke all on public.scratch_launch_dates, public.scratch_coming_soon from anon, authenticated;
grant select, insert, update, delete on public.scratch_launch_dates, public.scratch_coming_soon to service_role;
notify pgrst, 'reload schema';
