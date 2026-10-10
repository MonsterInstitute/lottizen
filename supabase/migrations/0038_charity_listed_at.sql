-- When a lottery was first listed on the site, so the owner's daily report
-- can name the lotteries added since yesterday (gated ones go live on their
-- own once their feed/season checks pass — see scripts/scrape_charity.py).
alter table public.charity_lotteries add column if not exists listed_at timestamptz;
update public.charity_lotteries set listed_at = '2026-10-08T00:00:00Z' where listed_at is null;
alter table public.charity_lotteries alter column listed_at set default now();
notify pgrst, 'reload schema';
