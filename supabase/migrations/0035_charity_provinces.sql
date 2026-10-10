-- A lottery can hold licences in several provinces (Jays Care: ON, AB, NS, NB, PE);
-- provinces lists every one, province is the primary. licence_no: the main licence.

alter table public.charity_lotteries add column if not exists provinces text[];
alter table public.charity_lotteries add column if not exists licence_no text;
notify pgrst, 'reload schema';
