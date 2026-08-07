-- Lottizen email subscription system (Phase 1: free tier newsletter).
--
-- No accounts, no passwords — a subscriber is identified by a long random
-- `magic_token` embedded in every email (confirm / manage-preferences /
-- unsubscribe links). `tier` defaults to 'free' and is reserved, unused, for
-- a future paid "Lottizen Plus" layer (see the Phase 4 brief) — nothing in
-- this migration or the app code enforces it yet.
--
-- Security: same pattern as every other table (0001_init.sql) — RLS on, no
-- policies, anon/authenticated revoked. Unlike the scraper tables, these ARE
-- written at request time (from Vercel serverless functions, not just the
-- Python build pipeline), always through the service-role key server-side —
-- never exposed to the browser.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- subscribers — one row per email. No password; magic_token is the only
-- credential, carried in every email link (confirm/manage/unsubscribe).
-- ---------------------------------------------------------------------------
create table if not exists public.subscribers (
  id               uuid primary key default gen_random_uuid(),
  email            text not null unique,
  -- Primary region, drives which games are pre-checked on the preferences
  -- page. Not the same as config/games.ts's Country type — 'UK' is split out
  -- from 'EU' here because a UK Lotto-only subscriber shouldn't default into
  -- EuroMillions/EuroJackpot.
  country          text not null default 'CA',
  -- 'instant' (email per followed-game draw) | 'weekly' (Sunday digest only) | 'both'.
  frequency        text not null default 'both',
  tier             text not null default 'free',
  magic_token      text not null unique,
  created_at       timestamptz not null default now(),
  confirmed_at     timestamptz,
  unsubscribed_at  timestamptz
);
create index if not exists idx_subscribers_confirmed
  on public.subscribers (confirmed_at)
  where confirmed_at is not null and unsubscribed_at is null;

-- ---------------------------------------------------------------------------
-- subscriber_games — many-to-many: which live game slugs a subscriber follows.
-- ---------------------------------------------------------------------------
create table if not exists public.subscriber_games (
  subscriber_id  uuid not null references public.subscribers(id) on delete cascade,
  game_slug      text not null,
  created_at     timestamptz not null default now(),
  primary key (subscriber_id, game_slug)
);
create index if not exists idx_subscriber_games_slug on public.subscriber_games(game_slug);

-- ---------------------------------------------------------------------------
-- subscriber_numbers — saved number combinations, auto-checked against each
-- new draw. Free tier is limited to 1 row per subscriber (enforced in the
-- app layer, not here — see lib/plus.ts's FREE_NUMBER_SET_LIMIT) so the
-- schema itself already supports multiple sets for a future paid tier.
-- ---------------------------------------------------------------------------
create table if not exists public.subscriber_numbers (
  id             bigint generated always as identity primary key,
  subscriber_id  uuid not null references public.subscribers(id) on delete cascade,
  game_slug      text not null,
  numbers        integer[] not null,
  label          text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_subscriber_numbers_subscriber on public.subscriber_numbers(subscriber_id);

-- ---------------------------------------------------------------------------
-- email_log — every send, for de-duplication (never two draw-result emails
-- for the same subscriber+game+day) and future unsubscribe-reason analysis.
-- game_slug is '' (not null) for non-game-specific mail (weekly_digest,
-- confirmation) so the dedup index below needs no NULL-handling expression.
-- sent_date is a stored column (not sent_at::date) because a timestamptz->date
-- cast is timezone-dependent (STABLE, not IMMUTABLE) and Postgres rejects
-- non-immutable expressions in an index.
-- ---------------------------------------------------------------------------
create table if not exists public.email_log (
  id             bigint generated always as identity primary key,
  subscriber_id  uuid not null references public.subscribers(id) on delete cascade,
  type           text not null,             -- 'confirmation' | 'draw_result' | 'weekly_digest'
  game_slug      text not null default '',
  sent_at        timestamptz not null default now(),
  sent_date      date not null default (now() at time zone 'America/Toronto')::date
);
create unique index if not exists idx_email_log_dedup
  on public.email_log (subscriber_id, type, game_slug, sent_date);

-- ---------------------------------------------------------------------------
-- Lock down, same as every other table.
-- ---------------------------------------------------------------------------
alter table public.subscribers        enable row level security;
alter table public.subscriber_games   enable row level security;
alter table public.subscriber_numbers enable row level security;
alter table public.email_log          enable row level security;

revoke all on public.subscribers, public.subscriber_games,
              public.subscriber_numbers, public.email_log
  from anon, authenticated;

grant select, insert, update, delete
  on public.subscribers, public.subscriber_games, public.subscriber_numbers, public.email_log
  to service_role;
grant usage, select on all sequences in schema public to service_role;

commit;
