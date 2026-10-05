-- ---------------------------------------------------------------------------
-- email_log gets an outcome.
--
-- Until now a row only meant "this send slot was claimed": claim_send()
-- inserts it BEFORE calling Resend so a workflow re-run can't double-send.
-- Whether the email then went out, was skipped (e.g. the free weekly alert
-- cap) or failed was never recorded, so the log counted 11 sends in a week
-- in which Resend sent 3.
--
--   queued   slot claimed, send not finished yet. A row still queued an hour
--            later means the sender died mid-send.
--   sent     Resend accepted it; provider_message_id is Resend's id, which
--            email_delivery_check.py looks up to confirm actual delivery.
--   skipped  deliberately not sent; skip_reason says why.
--   failed   Resend (or the network) rejected it; error has the detail.
--
-- "sent" still isn't "delivered" — delivery lives in Resend and is checked
-- against it, never inferred from this table.
-- Rows written before this migration are reconciled against Resend's sent
-- list by scripts/email_log_backfill.py.
-- ---------------------------------------------------------------------------
alter table public.email_log
  add column if not exists status text not null default 'queued',
  add column if not exists skip_reason text,
  add column if not exists provider_message_id text,
  add column if not exists error text,
  add column if not exists updated_at timestamptz;

alter table public.email_log drop constraint if exists email_log_status_check;
alter table public.email_log
  add constraint email_log_status_check check (status in ('queued', 'sent', 'skipped', 'failed'));

create index if not exists idx_email_log_status_date on public.email_log (sent_date, status);

notify pgrst, 'reload schema';
