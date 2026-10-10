-- A prize gets one "your ticket won" email as soon as the claim engine finds
-- it (scripts/send_claim_reminders.py), before the 30/7/3-day deadline
-- reminders. win_notified_at marks that it went out (or was attempted), so it
-- is sent once. Prizes found before this existed are marked as notified:
-- their owners already had reminders, and a burst of old "you won" mail
-- would be news to no one.
alter table public.prize_claims add column if not exists win_notified_at timestamptz;
update public.prize_claims set win_notified_at = coalesce(created_at, now()) where win_notified_at is null;
notify pgrst, 'reload schema';
