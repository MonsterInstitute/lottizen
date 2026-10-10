-- Loto-Québec lists a prize category and, for shared prizes, which share is
-- unclaimed ("1 of 10 shares") — the amount is that share, not the whole
-- prize, so the page has to show it. Free text, exactly as listed.
alter table public.unclaimed_prizes add column if not exists detail text;
notify pgrst, 'reload schema';
