-- ---------------------------------------------------------------------------
-- Province, for the weekly email's "this week's pick / skip" (lottery
-- tickets can only be bought in your own province). Optional: null = send
-- the country-level digest without a pick section.
--
-- Backfill (2026-10-10): the province of the scratch tickets a subscriber
-- follows, most-followed first; subscribers who follow none stay null.
-- ---------------------------------------------------------------------------
alter table public.subscribers add column if not exists province text;
alter table public.subscribers drop constraint if exists subscribers_province_check;
alter table public.subscribers add constraint subscribers_province_check
  check (province is null or province in ('ontario', 'quebec', 'british-columbia', 'western', 'atlantic'));

update public.subscribers s
set province = inferred.province
from (
  select distinct on (f.subscriber_id) f.subscriber_id,
         case f.agency when 'OLG' then 'ontario' when 'QUEBEC' then 'quebec' when 'BCLC' then 'british-columbia'
                       when 'WCLC' then 'western' when 'ALC' then 'atlantic' end as province
  from public.scratch_favourites f
  group by f.subscriber_id, f.agency
  order by f.subscriber_id, count(*) desc, f.agency
) inferred
where s.id = inferred.subscriber_id and s.province is null;

notify pgrst, 'reload schema';
