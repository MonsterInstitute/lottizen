-- Per-game facts an agency publishes outside its prize feed, cached so each
-- game's page is fetched once. OLG prints a "Prize payout" percentage on
-- every instant game's product page (e.g. 62.96 for the $2 Lucky 7s, 74.73
-- for the $50 Extreme): the share of the game's sales returned as prizes, as
-- printed — a fact about the game's design, not the odds of a ticket.
create table if not exists public.scratch_game_facts (
  agency       text not null,
  game_number  text not null,
  payout_pct   numeric,
  source_url   text not null,
  fetched_on   date not null,
  primary key (agency, game_number)
);
alter table public.scratch_game_facts enable row level security;
revoke all on public.scratch_game_facts from anon, authenticated;
grant select, insert, update, delete on public.scratch_game_facts to service_role;
notify pgrst, 'reload schema';
