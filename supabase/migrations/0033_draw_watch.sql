-- Draw-night watcher (app/api/cron/draw-watch): one row per game per draw,
-- recording how fast each step happened so "draw → live on lottizen.com"
-- latency is measured, alerted on (> 2h) and reported in the daily email.
create table if not exists public.draw_watch (
  game_id        text        not null,
  draw_date      date        not null,          -- local draw date, as in draws.draw_date
  scheduled_at   timestamptz not null,          -- the draw's scheduled time (lib/draw-schedule.ts)
  source_seen    jsonb       not null default '{}'::jsonb, -- {source: first time it showed this draw}
  first_source_at timestamptz,                  -- earliest of source_seen
  dispatched_at  timestamptz,                   -- last workflow dispatch for this draw
  dispatches     int         not null default 0,
  stored_at      timestamptz,                   -- first time the draws row was seen in Supabase
  live_at        timestamptz,                   -- first time lottizen.com/draw-status.json showed it
  latency_min    int,                           -- live_at - scheduled_at, minutes
  alerted_at     timestamptz,                   -- when the > 2h issue comment was posted
  updated_at     timestamptz not null default now(),
  primary key (game_id, draw_date)
);
create index if not exists draw_watch_scheduled_idx on public.draw_watch (scheduled_at desc);
alter table public.draw_watch enable row level security;
grant select, insert, update, delete on public.draw_watch to service_role;
