-- News items about charity lotteries (50/50 records, home lotteries selling out early).
alter table public.news_items drop constraint if exists news_items_category_check;
alter table public.news_items add constraint news_items_category_check
  check (category in ('draw', 'scratch', 'unclaimed', 'charity'));
notify pgrst, 'reload schema';
