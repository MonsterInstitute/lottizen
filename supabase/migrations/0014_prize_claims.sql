-- ---------------------------------------------------------------------------
-- prize_claims — one row per prize that needs collecting, from EITHER source.
--
-- A win can arrive two ways: from a saved number set that the nightly checker
-- matched against a draw (subscriber_numbers / combination_checks), or from a
-- ticket the owner entered by hand (user_tickets). Both need the identical
-- treatment afterwards — a countdown, 30/7/3 reminders, a "collected" switch,
-- and a line in the ledger. Modelling that once here, rather than bolting
-- claim state onto two different tables, keeps the reminder sweep and the
-- ledger each reading from a single place.
--
-- amount_cents is NULLABLE and paired with amount_source. Most Canadian prize
-- tiers are pari-mutuel: what "4 of 6" paid depends on that draw's pool and
-- how many others matched. Until the prize-breakdown scraper has run for a
-- given draw we genuinely do not know the amount, and the ledger shows "no
-- data" rather than an estimate (CLAUDE.md: never invent a number the data
-- can't support).
--
-- claim_deadline is likewise nullable — scratch tickets carry a printed
-- expiry we can't compute, and US games aren't supported yet. See
-- config/claim-deadlines.ts.
--
-- reminders_sent holds the day-thresholds already emailed (e.g. {30,7}), so
-- the daily sweep is idempotent without a second dedup table. email_log still
-- guards against same-day duplicates independently.
-- ---------------------------------------------------------------------------
create table if not exists public.prize_claims (
  id               bigint generated always as identity primary key,
  subscriber_id    uuid not null references public.subscribers(id) on delete cascade,

  source           text not null check (source in ('ticket', 'combination')),
  -- user_tickets.id or subscriber_numbers.id, depending on `source`. Not a FK:
  -- it points at one of two tables. Both cascade from subscribers, so an
  -- account deletion still removes everything.
  source_id        bigint not null,

  game_slug        text,
  draw_date        date,
  matched          integer,
  prize_tier       text,               -- '4/6', 'top prize', free text for scratch

  amount_cents     integer,
  amount_source    text not null default 'unknown'
                   check (amount_source in ('published', 'user_entered', 'unknown')),

  claim_deadline   date,
  claimed_at       timestamptz,
  reminders_sent   integer[] not null default '{}',

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One claim per source row per draw. A re-run of the nightly checker must
-- update the existing claim, never spawn a second countdown for the same win.
create unique index if not exists idx_prize_claims_unique
  on public.prize_claims (source, source_id, coalesce(draw_date, '1970-01-01'::date));

-- Drives the daily reminder sweep.
create index if not exists idx_prize_claims_due
  on public.prize_claims (claim_deadline)
  where claimed_at is null and claim_deadline is not null;

create index if not exists idx_prize_claims_subscriber
  on public.prize_claims (subscriber_id, claimed_at);

alter table public.prize_claims enable row level security;

revoke all on public.prize_claims from anon, authenticated;
grant select, insert, update, delete on public.prize_claims to service_role;
grant usage, select on all sequences in schema public to service_role;

-- DDL through the Management API does not refresh PostgREST's schema cache;
-- without this every query 404s with PGRST205 until the next restart.
notify pgrst, 'reload schema';
