-- Rename "Lottizen Pro" -> "Lottizen Plus" (its original planned name — see
-- the reserved-but-unused tier comment in 0004_subscribers.sql) and add
-- what the new $3/mo-$30/yr, 7-day-trial product needs.
--
-- subscribers.tier has no CHECK constraint (plain text, default 'free'), so
-- the app switching from writing 'pro' to 'plus' needs no column change.
-- Verified zero real subscribers on 'pro' and zero subscriptions rows in
-- production before writing this migration — Stripe billing was scaffolded
-- but never actually configured live, so there is nothing to backfill.

begin;

-- subscriptions.trial_end — Stripe's sub.trial_end, synced from the webhook,
-- so the account page can show "trial ends in N days" (the 7-day trial
-- requires a card up front, per the plan, so this is a real countdown to a
-- real charge, not just informational).
alter table public.subscriptions add column if not exists trial_end timestamptz;

commit;
