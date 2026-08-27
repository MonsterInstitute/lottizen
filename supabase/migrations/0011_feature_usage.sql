-- ---------------------------------------------------------------------------
-- feature_usage — monthly quota counter for Plus features that free users get
-- a limited taste of (stats-weighted number generation, number backtesting).
--
-- The product rule is "1 free run per calendar month, then upgrade": someone
-- arriving from search must be able to actually USE the advertised feature
-- once rather than hit a wall, since the generator pages' search snippets
-- promise stats-weighted picks.
--
-- Counted server-side because the client cannot be trusted with a quota — the
-- generator used to run entirely in the browser, where any "lock" was
-- cosmetic and readable straight out of the JS bundle.
--
-- `period` is a 'YYYY-MM' string in America/Toronto (the timezone every other
-- date boundary in this project uses — see email_log.sent_date). A string
-- rather than a date so the unique index below expresses "one row per
-- subscriber per feature per month" directly, with no date-truncation
-- function that Postgres would reject as non-immutable in an index.
-- ---------------------------------------------------------------------------
create table if not exists public.feature_usage (
  id             bigint generated always as identity primary key,
  subscriber_id  uuid not null references public.subscribers(id) on delete cascade,
  feature        text not null,               -- 'weighted_generator' | 'backtest'
  period         text not null,               -- 'YYYY-MM', America/Toronto
  used_count     integer not null default 0,
  first_used_at  timestamptz not null default now(),
  last_used_at   timestamptz not null default now()
);

create unique index if not exists idx_feature_usage_period
  on public.feature_usage (subscriber_id, feature, period);

alter table public.feature_usage enable row level security;

-- Service-role only, matching every other account table (see 0004/0006):
-- reached exclusively from server-side route handlers, never the browser.
-- The grant is NOT optional -- RLS plus a bare revoke leaves service_role
-- without table privileges and every query fails with "permission denied".
revoke all on public.feature_usage from anon, authenticated;
grant select, insert, update, delete on public.feature_usage to service_role;
grant usage, select on all sequences in schema public to service_role;
