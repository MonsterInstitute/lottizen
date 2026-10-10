-- ---------------------------------------------------------------------------
-- "This week's pick" per province and price band (scripts/weekly_picks.py).
-- Chosen once per week (Monday, Toronto) so it doesn't jump around daily,
-- but re-checked every day: if the pick stops being on sale or its last top
-- prize is claimed, it's replaced that day — replaced_on/replaced_reason on
-- the old row, a new row for the new pick — and the page says so.
-- The skip list ("on sale, no top prize left") is a daily fact, not stored.
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_picks (
  id               bigint generated always as identity primary key,
  week_start       date not null,
  province         text not null,
  band             text not null,            -- 'overall' | '1-5' | '10' | '20+'
  agency           text not null,
  game_number      text not null,
  game_slug        text not null,
  chosen_on        date not null,
  replaced_on      date,
  replaced_reason  text
);
create index if not exists idx_weekly_picks_week on public.weekly_picks (week_start, province, band);
alter table public.weekly_picks enable row level security;
revoke all on public.weekly_picks from anon, authenticated;
grant select, insert, update, delete on public.weekly_picks to service_role;
grant usage, select on all sequences in schema public to service_role;
notify pgrst, 'reload schema';
