-- ---------------------------------------------------------------------------
-- IndexNow submission state (scripts/indexnow_submit.py).
--
-- indexnow_urls: the lastmod each URL had when we last submitted it. A URL is
-- re-submitted only when its live sitemap lastmod moves past this, so the
-- eight daily workflows that each rebuild the site never re-send the same
-- unchanged page (IndexNow penalises repeat submissions of unchanged URLs).
--
-- indexnow_batches: one row per POST to api.indexnow.org, for the weekly
-- report's "submitted this week" count. Records what we sent and the HTTP
-- status the endpoint returned — not whether any engine indexed it.
-- ---------------------------------------------------------------------------
create table if not exists public.indexnow_urls (
  url            text primary key,
  lastmod        timestamptz,          -- null for pages with no lastmod
  submitted_at   timestamptz not null default now()
);

create table if not exists public.indexnow_batches (
  id             bigint generated always as identity primary key,
  submitted_at   timestamptz not null default now(),
  trigger        text not null,        -- workflow name or 'initial' / 'manual'
  url_count      int not null,
  http_status    int not null
);
create index if not exists idx_indexnow_batches_submitted_at
  on public.indexnow_batches (submitted_at);

alter table public.indexnow_urls enable row level security;
alter table public.indexnow_batches enable row level security;
revoke all on public.indexnow_urls from anon, authenticated;
revoke all on public.indexnow_batches from anon, authenticated;
-- Not optional: RLS plus a bare revoke leaves service_role without table
-- privileges (see 0011 / 0015).
grant select, insert, update, delete on public.indexnow_urls to service_role;
grant select, insert, update, delete on public.indexnow_batches to service_role;
grant usage, select on all sequences in schema public to service_role;

-- DDL through the Management API does not refresh PostgREST's schema cache;
-- without this every query 404s with PGRST205 until the next restart.
notify pgrst, 'reload schema';
