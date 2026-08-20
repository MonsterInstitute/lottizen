-- Lottizen Pro: accounts, sessions, multi-combination tracking, persisted
-- draw-result checks, scratch favourites, and subscription/entitlement state.
--
-- Deliberately extends the EXISTING `subscribers` table as the User entity
-- (email, tier, frequency, country, magic_token already there from the
-- Phase 1 email system) rather than introducing a parallel users table —
-- see the Phase 1 migration (0004_subscribers.sql) for that table's shape.
--
-- Security: same pattern as every other table — RLS on, no policies,
-- anon/authenticated revoked, only service_role (used exclusively from
-- server-side route handlers, never the browser) can read/write.

begin;

-- ---------------------------------------------------------------------------
-- login_tokens — short-lived, single-use tokens for passwordless sign-in
-- email links. Distinct from subscribers.magic_token (long-lived, used for
-- the no-login preferences/unsubscribe links every content email carries) —
-- a login credential should expire and be single-use; a "manage my
-- preferences" link should not.
-- ---------------------------------------------------------------------------
create table if not exists public.login_tokens (
  id             bigint generated always as identity primary key,
  subscriber_id  uuid not null references public.subscribers(id) on delete cascade,
  token          text not null unique,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  used_at        timestamptz
);
create index if not exists idx_login_tokens_subscriber on public.login_tokens(subscriber_id);

-- ---------------------------------------------------------------------------
-- sessions — the signed-in "My Lottizen" dashboard session, backing an
-- httpOnly cookie. Table-backed (not a signed/stateless JWT) so sign-out and
-- account deletion can actually revoke access server-side, consistent with
-- this codebase's DB-first approach elsewhere.
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id             bigint generated always as identity primary key,
  subscriber_id  uuid not null references public.subscribers(id) on delete cascade,
  session_token  text not null unique,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  last_seen_at   timestamptz not null default now()
);
create index if not exists idx_sessions_subscriber on public.sessions(subscriber_id);
create index if not exists idx_sessions_token on public.sessions(session_token);

-- ---------------------------------------------------------------------------
-- subscriber_numbers upgrade: Phase 1 built this as a single-row-per-
-- subscriber "replace on save" table (free tier's one combination). Lottizen
-- Pro needs true multi-row CRUD (Pro: many combinations) with real
-- create/update/delete by id, plus duplicate protection so a user can't
-- accidentally save the identical combination twice for the same game.
-- ---------------------------------------------------------------------------
alter table public.subscriber_numbers
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists idx_subscriber_numbers_dedup
  on public.subscriber_numbers (subscriber_id, game_slug, numbers);

-- ---------------------------------------------------------------------------
-- combination_checks — persisted result of checking one saved combination
-- against one draw, so "recently checked results" can be shown on the
-- dashboard without recomputing. Written by scripts/send_draw_emails.py
-- right where it already checks saved numbers for email content.
--
-- possible_prize is deliberately a cautious label, never a dollar amount or
-- tier guess we can't back with real prize-structure data (this repo has no
-- official prize-tier table for draw games, only jackpot estimates) — see
-- lib/prize-language.ts. NULL when there's no plausible prize.
-- ---------------------------------------------------------------------------
create table if not exists public.combination_checks (
  id              bigint generated always as identity primary key,
  subscriber_id   uuid not null references public.subscribers(id) on delete cascade,
  combination_id  bigint not null references public.subscriber_numbers(id) on delete cascade,
  game_slug       text not null,
  draw_date       text not null,
  matched_main    integer not null,
  pick            integer not null,
  bonus_matched   boolean,
  possible_prize  text,
  created_at      timestamptz not null default now()
);
create unique index if not exists idx_combination_checks_dedup
  on public.combination_checks (combination_id, draw_date);
create index if not exists idx_combination_checks_subscriber
  on public.combination_checks (subscriber_id, created_at desc);

-- ---------------------------------------------------------------------------
-- scratch_favourites — following for Ontario scratch tickets, separate from
-- subscriber_games (draw games only; different slug namespace).
-- ---------------------------------------------------------------------------
create table if not exists public.scratch_favourites (
  subscriber_id  uuid not null references public.subscribers(id) on delete cascade,
  game_slug      text not null,
  created_at     timestamptz not null default now(),
  primary key (subscriber_id, game_slug)
);

-- ---------------------------------------------------------------------------
-- subscriptions — Stripe-shaped entitlement state, one row per subscriber.
-- Exists as real architecture even though Stripe isn't configured yet (see
-- lib/stripe.ts) — status defaults to 'none' and subscribers.tier stays
-- 'free' for everyone until a real webhook flips it. Never write 'active'
-- here without a genuine Stripe event.
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                      bigint generated always as identity primary key,
  subscriber_id           uuid not null unique references public.subscribers(id) on delete cascade,
  stripe_customer_id      text,
  stripe_subscription_id  text unique,
  plan                    text,               -- 'monthly' | 'annual'
  status                  text not null default 'none',
  -- 'none'|'trialing'|'active'|'past_due'|'canceled'|'incomplete'|'incomplete_expired'|'unpaid'
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- scratch_rank_snapshots — daily history of each scratch game's rank/value
-- score, so ranking-change alerts and history views become possible. Same
-- "start accumulating today" pattern as jackpot_snapshots
-- (0005_jackpot_snapshots.sql) — no historical backfill exists.
-- ---------------------------------------------------------------------------
create table if not exists public.scratch_rank_snapshots (
  id                     bigint generated always as identity primary key,
  game_slug              text not null,
  captured_date          date not null default (now() at time zone 'America/Toronto')::date,
  rank                   integer not null,
  value_score            double precision not null,
  remaining_prize_pool   double precision not null,
  top_prizes_remaining   integer not null,
  price                  double precision not null
);
create unique index if not exists idx_scratch_rank_snapshots_dedup
  on public.scratch_rank_snapshots (game_slug, captured_date);
create index if not exists idx_scratch_rank_snapshots_game
  on public.scratch_rank_snapshots (game_slug, captured_date desc);

-- ---------------------------------------------------------------------------
-- Lock down, same pattern as every other table.
-- ---------------------------------------------------------------------------
alter table public.login_tokens          enable row level security;
alter table public.sessions              enable row level security;
alter table public.combination_checks    enable row level security;
alter table public.scratch_favourites    enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.scratch_rank_snapshots enable row level security;

revoke all on public.login_tokens, public.sessions, public.combination_checks,
              public.scratch_favourites, public.subscriptions, public.scratch_rank_snapshots
  from anon, authenticated;

grant select, insert, update, delete
  on public.login_tokens, public.sessions, public.combination_checks,
     public.scratch_favourites, public.subscriptions, public.scratch_rank_snapshots
  to service_role;
grant usage, select on all sequences in schema public to service_role;

commit;
