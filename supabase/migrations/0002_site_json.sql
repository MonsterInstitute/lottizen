-- Build handoff table. The data-refresh workflows (GitHub Actions, Python) run
-- the calculators against Supabase, then publish the generated JSON here. The
-- Vercel build's Node prefetch (scripts/prefetch_supabase.mjs) reads these rows
-- and materializes them to data/<path> before `next build` — so the site is
-- built from Supabase and no JSON is ever committed.
--
-- `content` is the EXACT JSON string to write to disk (stored as text, not jsonb,
-- so it round-trips byte-for-byte with no reformatting). `path` is relative to
-- the repo's data/ dir, e.g. 'rankings.json', 'draws/lotto-max.json',
-- 'stats/powerball.json', 'draws/_latest.json'.

begin;

create table if not exists public.site_json (
  path        text primary key,
  content     text not null,
  updated_at  text not null
);

-- Same lockdown as the data tables: only the service role can read/write.
alter table public.site_json enable row level security;
revoke all on public.site_json from anon, authenticated;
grant select, insert, update, delete on public.site_json to service_role;

commit;
