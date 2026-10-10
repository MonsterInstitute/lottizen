-- Daily row counts of the append-only history tables, written by
-- scripts/history_integrity.py (freshness-watchdog.yml). A count that goes
-- DOWN means history was deleted — the failure that went unnoticed for two
-- months when scratch_snapshots was cascade-deleted every day (0022).
create table if not exists public.table_row_counts (
  captured_date  date not null,
  table_name     text not null,
  row_count      bigint not null,
  primary key (captured_date, table_name)
);
alter table public.table_row_counts enable row level security;
revoke all on public.table_row_counts from anon, authenticated;
grant select, insert, update, delete on public.table_row_counts to service_role;
notify pgrst, 'reload schema';
