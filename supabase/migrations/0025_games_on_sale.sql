-- ---------------------------------------------------------------------------
-- Is a scratch game on sale now? The agencies' prize lists include games that
-- have stopped selling but whose prizes can still be claimed (BCLC's prize
-- feed listed 168 games on 2026-10-10; its product catalog, 79). Anything
-- that tells a buyer what to buy or skip must use on_sale, never "still on
-- the agency's prize list".
--
--   on_sale       true  = in the agency's current product catalog
--                 false = listed for prizes but not in the catalog
--                 null  = this agency gives no reliable on-sale signal;
--                         buy/skip features don't show its games
--   claim_expiry  the claim deadline the agency publishes for the game,
--                 where it does (ALC's catalog expiryDate)
-- Set by each scraper on every refresh (games rows are rebuilt each run).
-- ---------------------------------------------------------------------------
alter table public.games
  add column if not exists on_sale boolean,
  add column if not exists claim_expiry date;

notify pgrst, 'reload schema';
