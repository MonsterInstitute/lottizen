-- ---------------------------------------------------------------------------
-- 'unknown' — for email_log rows written before 0019 that predate Resend's
-- retained history (it goes back to 2026-09-06), so there is nothing left to
-- check their outcome against. Calling them sent or skipped would be a
-- guess. Only scripts/email_log_backfill.py writes it; live senders never do.
-- ---------------------------------------------------------------------------
alter table public.email_log drop constraint if exists email_log_status_check;
alter table public.email_log
  add constraint email_log_status_check check (status in ('queued', 'sent', 'skipped', 'failed', 'unknown'));

notify pgrst, 'reload schema';
