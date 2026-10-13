-- An agency's own announcement about a listed prize (an OLG "check your
-- tickets" release) can be newer and more specific than its unclaimed list:
-- OLG's list said "Rural Toronto West" for the $40M Lotto Max prize of
-- 2025-10-28; its 2026-10-05 release names Grey County. The newer official
-- source wins on the page, with its own title, date and link; the list's
-- wording is kept in `location`. Set by scripts/unclaimed.py, never cleared
-- by it (the release drops out of the agency's feed long before the deadline).
alter table public.unclaimed_prizes add column if not exists notice_location text;
alter table public.unclaimed_prizes add column if not exists notice_date date;
alter table public.unclaimed_prizes add column if not exists notice_title text;
alter table public.unclaimed_prizes add column if not exists notice_url text;
notify pgrst, 'reload schema';
