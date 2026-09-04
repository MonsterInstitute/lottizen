-- ---------------------------------------------------------------------------
-- prize_breakdowns — what each prize tier actually paid, per draw, as published
-- by the operator.
--
-- This is the missing half of the ticket wallet. prize_claims.amount_cents was
-- deliberately left nullable in 0014 because most Canadian tiers are
-- pari-mutuel: "4 of 6" is not a fixed amount, it depends on that draw's pool
-- and how many others matched. Without a published figure the ledger has to
-- say "no data". This table is where the published figure lands.
--
-- Every row is a number the operator printed, never a computation of ours:
--   * BCLC PlayNow  https://www.playnow.com/services2/lotto/draw/<KEY>/<date>
--     JSON, one object per prize division with winners and prize-per-winner.
--     Covers the three national games (Lotto Max, Lotto 6/49, Daily Grand)
--     plus BC/49.
--   * WCLC          https://www.wclc.com/<game>-prize-details.htm?drawNumber=N
--     HTML prize-details table. Covers the two Western regional games.
--
-- Ontario 49, Lottario and MegaDice have NO row here and no adapter: OLG
-- publishes those breakdowns only inside a client-rendered page with no
-- feed behind it. Their claims keep amount_source 'unknown' and the ledger
-- shows "no data" for them, which is the honest outcome — see the HONESTY
-- CONSTRAINT note in lib/plus-analytics.ts for the same rule applied to
-- scratch data.
--
-- prize_cents is BIGINT, not INTEGER. A Lotto Max jackpot of $90,000,000 is
-- 9,000,000,000 cents — four times past int4's 2,147,483,647 ceiling, which
-- would have failed on the exact rows that matter most.
--
-- prize_cents is NULL for tiers whose published value isn't money: WCLC prints
-- "FREE PLAY" for the bottom Lotto Max tier and "CARRIED OVER" / "NOT WON" for
-- an unwon jackpot. The published wording is kept verbatim in prize_label
-- rather than being coerced to 0, which would read as "your prize is $0".
-- ---------------------------------------------------------------------------
create table if not exists public.prize_breakdowns (
  id             bigint generated always as identity primary key,

  game_slug      text not null,
  draw_date      date not null,

  -- Canonical tier key, derived from the published label so the two sources
  -- agree: '<main>/<pick>' plus '+B' when the tier also requires the bonus.
  -- e.g. '6/6', '5/6+B', '3/7+B'. Daily Grand's Grand Number is a separate
  -- ball, so its tiers read '4/5+B' / '4/5'.
  tier_code      text not null,
  -- Exactly as the operator wrote it ('5/6+Bonus', '4 of 7 + Bonus'). Kept so
  -- the UI can quote the operator rather than our normalisation.
  tier_label     text not null,

  match_main     integer not null,
  match_bonus    boolean not null default false,

  winners        integer,
  prize_cents    bigint,
  prize_label    text,

  source         text not null check (source in ('playnow', 'wclc')),
  source_url     text,
  fetched_at     timestamptz not null default now()
);

-- One published figure per tier per draw. A re-run updates in place; the
-- amounts are finalised by the operator within a day of the draw and then
-- never move, but re-running must never fork a second row.
create unique index if not exists idx_prize_breakdowns_unique
  on public.prize_breakdowns (game_slug, draw_date, tier_code);

-- The reminder engine's lookup: given a game, a draw, and how many numbers
-- matched, what did that tier pay?
create index if not exists idx_prize_breakdowns_lookup
  on public.prize_breakdowns (game_slug, draw_date, match_main);

alter table public.prize_breakdowns enable row level security;

-- Published data, but written only by the scraper and read only by server-side
-- code, so it follows the same service-role-only pattern as every other table
-- here. The grant is NOT optional: RLS plus a bare revoke leaves service_role
-- without table privileges and every query fails with "permission denied"
-- (learned the hard way in 0011).
revoke all on public.prize_breakdowns from anon, authenticated;
grant select, insert, update, delete on public.prize_breakdowns to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Same ceiling problem, one table over: prize_claims.amount_cents was declared
-- integer in 0014. A jackpot win — the single row where this table's accuracy
-- matters most — would overflow it. Widen before any real amount is written.
-- ---------------------------------------------------------------------------
alter table public.prize_claims
  alter column amount_cents type bigint;

-- DDL through the Management API does not refresh PostgREST's schema cache;
-- without this every query 404s with PGRST205 until the next restart.
notify pgrst, 'reload schema';
