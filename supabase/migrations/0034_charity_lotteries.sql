-- Charity lotteries: the third pillar beside draw games and scratch tickets.
-- Hospital/charity home lotteries, 50/50s, Catch the Ace and community
-- raffles, organised by licensing province. Only figures the lottery itself
-- publishes (its rules page / official site) are stored — never a third-party
-- review site's numbers, never an estimate.

begin;

-- One row per lottery (a recurring program, e.g. "Princess Margaret Home Lottery").
create table if not exists public.charity_lotteries (
  id                text primary key,              -- slug
  name              text not null,
  kind              text not null check (kind in ('home', '5050', 'catch_the_ace', 'raffle')),
  phase             int  not null default 1,       -- 1 major home + team 50/50, 2 monthly 50/50 + CTA, 3 community
  operator          text,                          -- the licensed charity / foundation
  province          text not null,                 -- licensing province, 2-letter (ON, BC, AB, ...)
  licence_authority text,
  platform          text,                          -- ticketing vendor (scripts/charity/<platform>.py)
  platform_ref      text,                          -- the vendor's id/slug for this lottery
  url               text,                          -- official site
  rules_url         text,
  buy_url           text,                          -- official purchase page; never carries tracking parameters
  results_url       text,
  team              text,                          -- sports team, for team 50/50s
  active            boolean not null default true,
  first_seen        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists charity_lotteries_province_idx on public.charity_lotteries (province);

-- One row per edition / draw period (a home lottery's fall edition, one
-- game's 50/50, a month's 50/50, a Catch the Ace week).
create table if not exists public.charity_editions (
  lottery_id    text not null references public.charity_lotteries(id) on delete cascade,
  edition       text not null,                     -- vendor id or "2026-fall"
  title         text,
  licence_no    text,
  status        text check (status in ('upcoming', 'on_sale', 'sold_out', 'closed', 'drawn')),
  ticket_cap    int,                               -- published maximum tickets
  prize_count   int,                               -- published number of prizes
  prize_value   numeric,                           -- published total prize value, CAD
  grand_prize   text,
  grand_prize_value numeric,
  odds          jsonb,                             -- [{label, text}] — published odds, verbatim
  price_tiers   jsonb,                             -- [{tickets, price, label}]
  draws         jsonb,                             -- [{name, cutoff, draw_date, prize, prize_value}] published schedule
  sales_open    timestamptz,
  sales_close   timestamptz,
  draw_date     timestamptz,                       -- grand prize / main draw
  jackpot       numeric,                           -- 50/50 / Catch the Ace: current published pot
  jackpot_at    timestamptz,
  sold_out      boolean,
  source_url    text,
  raw           jsonb,
  scraped_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (lottery_id, edition)
);
create index if not exists charity_editions_close_idx on public.charity_editions (sales_close);

-- Daily snapshot per open edition: pot growth, sell-out, days to close.
create table if not exists public.charity_snapshots (
  lottery_id     text not null,
  edition        text not null,
  captured_date  date not null,
  jackpot        numeric,
  sold_out       boolean,
  status         text,
  days_to_close  int,
  captured_at    timestamptz not null default now(),
  primary key (lottery_id, edition, captured_date)
);

-- Published winners / winning numbers.
create table if not exists public.charity_results (
  lottery_id      text not null references public.charity_lotteries(id) on delete cascade,
  edition         text not null,
  draw_name       text not null,                   -- "Grand Prize", "Early Bird 2", "50/50"
  draw_date       date,
  winning_numbers text[],
  prize           text,
  prize_value     numeric,
  claimed         boolean,
  source_url      text,
  scraped_at      timestamptz not null default now(),
  primary key (lottery_id, edition, draw_name)
);
create index if not exists charity_results_date_idx on public.charity_results (draw_date desc);

-- Subscribers following a charity lottery (deadline / sell-out / result emails).
create table if not exists public.charity_follows (
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  lottery_id    text not null references public.charity_lotteries(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (subscriber_id, lottery_id)
);
create index if not exists charity_follows_lottery_idx on public.charity_follows (lottery_id);

-- Where each subscriber signed up (page path + kind of page) and the
-- province of the page / their choice. Recorded from 2026-10-10 on.
alter table public.subscribers add column if not exists signup_path text;
alter table public.subscribers add column if not exists signup_kind text;
alter table public.subscribers add column if not exists signup_province text;

-- First-party page views, no cookies and no personal data: a count per day
-- per path, from a beacon on every page (bots excluded client-side).
create table if not exists public.page_views_daily (
  day    date not null,
  path   text not null,
  kind   text not null,
  views  int  not null default 0,
  primary key (day, path)
);
create or replace function public.pv_hit(p_path text, p_kind text) returns void
language sql security definer set search_path = public as $$
  insert into public.page_views_daily (day, path, kind, views)
  values ((now() at time zone 'America/Toronto')::date, left(p_path, 300), left(p_kind, 40), 1)
  on conflict (day, path) do update set views = page_views_daily.views + 1;
$$;

alter table public.charity_lotteries enable row level security;
alter table public.charity_editions enable row level security;
alter table public.charity_snapshots enable row level security;
alter table public.charity_results enable row level security;
alter table public.charity_follows enable row level security;
alter table public.page_views_daily enable row level security;
grant select, insert, update, delete on public.charity_lotteries, public.charity_editions, public.charity_snapshots,
  public.charity_results, public.charity_follows, public.page_views_daily to service_role;
revoke execute on function public.pv_hit(text, text) from public, anon, authenticated;
grant execute on function public.pv_hit(text, text) to service_role;

commit;
notify pgrst, 'reload schema';
