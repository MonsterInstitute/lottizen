-- Per-game draw count + latest date, for the deploy-gate audit and the freshness
-- watchdog. PostgREST can't GROUP BY through its query API, so expose it as a
-- view (returns ~20 rows) instead of pulling all ~95k draw rows every check.
-- Only the service role can read it (same lockdown as the base tables).

create or replace view public.draw_counts as
  select game_id,
         count(*)::int      as cnt,
         max(draw_date)     as max_date
  from public.draws
  group by game_id;

revoke all on public.draw_counts from anon, authenticated;
grant select on public.draw_counts to service_role;
