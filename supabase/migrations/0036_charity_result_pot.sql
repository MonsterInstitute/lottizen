alter table public.charity_results add column if not exists pot numeric;
comment on column public.charity_results.pot is '50/50: the total pot of that draw (prize_value is the winner''s share)';
notify pgrst, 'reload schema';
