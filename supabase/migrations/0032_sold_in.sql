-- ---------------------------------------------------------------------------
-- Where a scratch game is sold, below the agency level. WCLC serves Alberta,
-- Saskatchewan and Manitoba (and the territories), and some of its games
-- are sold in one province only — "Only In Alberta Bingo", "Rider Nation
-- (Saskatchewan Exclusive)". WCLC marks these only in the game's name; its
-- product pages say nothing about availability for ordinary games, which
-- are sold across the region.
--
--   sold_in  null = everywhere the agency sells; otherwise province codes,
--            e.g. {AB}. Set by the scraper from the agency's own labelling.
-- Buy/skip features filter by the visitor's actual province with it.
-- Subscribers' province moves from 'western' to the province itself.
-- ---------------------------------------------------------------------------
alter table public.games add column if not exists sold_in text[];

alter table public.subscribers drop constraint if exists subscribers_province_check;
update public.subscribers set province = null where province = 'western';
alter table public.subscribers add constraint subscribers_province_check
  check (province is null or province in ('ontario', 'quebec', 'british-columbia', 'alberta', 'saskatchewan',
                                          'manitoba', 'territories', 'atlantic'));
notify pgrst, 'reload schema';
