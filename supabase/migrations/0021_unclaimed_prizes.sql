-- ---------------------------------------------------------------------------
-- Unclaimed prizes from the agencies' official lists (scripts/unclaimed.py,
-- unclaimed-daily.yml), behind /unclaimed.
--
-- One row per listed prize, keyed on what the agency publishes about it. The
-- daily run marks every prize it sees (last_seen) and, for an agency whose
-- list it read successfully, stamps removed_on on any prize that has dropped
-- off that list. A prize leaving a list before its deadline is a fact we can
-- state ("no longer listed as of <date>"); WHY it left (claimed, list
-- revised) is the agency's to say, so the site never asserts it was claimed.
-- ---------------------------------------------------------------------------
create table if not exists public.unclaimed_prizes (
  id           bigint generated always as identity primary key,
  prize_key    text not null unique,       -- agency|game|draw_date|amount|location
  agency       text not null,
  game         text not null,
  draw_date    date not null,
  amount       numeric not null,
  location     text,
  expires      date not null,
  source_url   text not null,
  list_as_of   text,                       -- the list's own "as of" wording
  first_seen   date not null,
  last_seen    date not null,
  removed_on   date
);
create index if not exists idx_unclaimed_prizes_agency on public.unclaimed_prizes (agency, removed_on);

alter table public.unclaimed_prizes enable row level security;
revoke all on public.unclaimed_prizes from anon, authenticated;
grant select, insert, update, delete on public.unclaimed_prizes to service_role;
grant usage, select on all sequences in schema public to service_role;

notify pgrst, 'reload schema';
