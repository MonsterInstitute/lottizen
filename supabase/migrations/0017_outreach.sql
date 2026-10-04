-- ---------------------------------------------------------------------------
-- Outreach radar (scripts/outreach_radar.py, scripts/press_radar.py).
--
-- outreach_opportunities: one row per thing found (Reddit post/comment, news
--   article, HN item, X post). The (source, external_id) key is the dedupe:
--   a row that exists is never inserted or emailed again. `notified_at` marks
--   which ones went into a digest email. Like email_log, it records that we
--   handed the digest to Resend, not that it arrived.
--
-- outreach_contacts: journalists/outlets seen writing about Canadian lotteries,
--   accumulated from news articles, for press pitches. One row per
--   (normalized name, outlet).
--
-- press_events: media-timing triggers (big jackpots, big unclaimed prizes near
--   expiry). `event_key` makes each event fire once, e.g.
--   'jackpot:lotto-max:2026-10-06' or 'unclaimed:olg:lotto-max:2025-10-28:40000000'.
-- ---------------------------------------------------------------------------
create table if not exists public.outreach_opportunities (
  id             bigint generated always as identity primary key,
  source         text not null,           -- reddit | news | hn | x
  external_id    text not null,
  url            text not null,
  title          text not null,
  excerpt        text,
  author         text,
  community      text,                    -- subreddit, outlet, 'Hacker News'
  published_at   timestamptz,
  engagement     jsonb not null default '{}'::jsonb,  -- {comments, score}
  topic          text,                    -- config topic key
  value_score    int not null default 0,
  data_points    jsonb not null default '[]'::jsonb,  -- [{label, value, url}]
  reply_draft    text,
  found_at       timestamptz not null default now(),
  notified_at    timestamptz,
  unique (source, external_id)
);
create index if not exists idx_outreach_opps_pending
  on public.outreach_opportunities (notified_at, value_score desc);

create table if not exists public.outreach_contacts (
  id                  bigint generated always as identity primary key,
  name                text not null,
  name_key            text not null,      -- lower-cased, whitespace-collapsed
  outlet              text not null,
  outlet_domain       text,
  first_seen          timestamptz not null default now(),
  last_seen           timestamptz not null default now(),
  article_count       int not null default 1,
  last_article_title  text,
  last_article_url    text,
  topics              text[] not null default '{}',
  unique (name_key, outlet)
);

create table if not exists public.press_events (
  id             bigint generated always as identity primary key,
  event_key      text not null unique,
  kind           text not null,           -- jackpot | unclaimed
  payload        jsonb not null default '{}'::jsonb,
  triggered_at   timestamptz not null default now(),
  emailed_at     timestamptz
);

alter table public.outreach_opportunities enable row level security;
alter table public.outreach_contacts enable row level security;
alter table public.press_events enable row level security;
revoke all on public.outreach_opportunities from anon, authenticated;
revoke all on public.outreach_contacts from anon, authenticated;
revoke all on public.press_events from anon, authenticated;
-- Not optional: RLS plus a bare revoke leaves service_role without table
-- privileges (see 0011 / 0015).
grant select, insert, update, delete on public.outreach_opportunities to service_role;
grant select, insert, update, delete on public.outreach_contacts to service_role;
grant select, insert, update, delete on public.press_events to service_role;
grant usage, select on all sequences in schema public to service_role;

-- DDL through the Management API does not refresh PostgREST's schema cache.
notify pgrst, 'reload schema';
