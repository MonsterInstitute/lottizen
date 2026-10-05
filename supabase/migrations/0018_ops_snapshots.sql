-- ---------------------------------------------------------------------------
-- Daily operating snapshot (scripts/ops_report.py, admin-daily.yml).
--
-- One row per Toronto calendar day, holding the point-in-time totals that no
-- source keeps a history of: Stripe only knows "now" for active/trialing
-- subscriptions and MRR, and subscribers.unsubscribed_at can be cleared. The
-- daily email compares against yesterday's row and the weekly email against
-- the row from seven days earlier; a missing row renders as "no comparison",
-- never as zero.
-- ---------------------------------------------------------------------------
create table if not exists public.ops_snapshots (
  snapshot_date  date primary key,
  metrics        jsonb not null,
  captured_at    timestamptz not null default now()
);

alter table public.ops_snapshots enable row level security;
revoke all on public.ops_snapshots from anon, authenticated;
grant select, insert, update, delete on public.ops_snapshots to service_role;

notify pgrst, 'reload schema';
