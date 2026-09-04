-- ---------------------------------------------------------------------------
-- user_tickets — the ticket wallet. Physical tickets a subscriber enters by
-- hand, both draw and scratch.
--
-- Complements saved number sets rather than replacing them: a saved set is a
-- standing instruction ("check these every draw, forever"), while a ticket is
-- one specific purchase with its own purchase date, cost, and — crucially —
-- its own claim deadline. Scratch tickets have no numbers at all, so they can
-- only ever be represented here.
--
-- claim_deadline is NULLABLE on purpose. For Canadian draw games it is
-- computed as draw date + 1 year (see config/claim-deadlines.ts, every rule
-- sourced). For scratch tickets it CANNOT be computed — each agency sets
-- instant-game expiry per game and prints it on the ticket — so it stays null
-- until the owner enters the printed date, and the ticket is excluded from
-- countdown reminders while null. Guessing would be worse than not knowing:
-- the value drives real reminder emails. US tickets stay null too; New York's
-- rule keys off the announced end of a game, which is a different model.
--
-- Money is stored in integer cents. Floats accumulate error across a ledger
-- that sums spend and returns over years.
-- ---------------------------------------------------------------------------
create table if not exists public.user_tickets (
  id                bigint generated always as identity primary key,
  subscriber_id     uuid not null references public.subscribers(id) on delete cascade,

  ticket_type       text not null check (ticket_type in ('draw', 'scratch')),
  -- draw tickets: the games config slug. scratch: the agency's game slug.
  game_slug         text,
  agency            text,
  label             text,               -- scratch game name as the user typed it

  numbers           integer[],          -- draw only; null for scratch
  purchase_date     date,
  draw_date         date,               -- draw only

  cost_cents        integer,            -- what they paid, when known

  claim_deadline    date,               -- see the note above; null = unknown
  deadline_source   text not null default 'computed'
                    check (deadline_source in ('computed', 'user_entered', 'unknown')),

  status            text not null default 'pending'
                    check (status in ('pending', 'checked_no_win', 'won_unclaimed', 'claimed', 'expired')),
  claimed_at        timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_user_tickets_subscriber
  on public.user_tickets (subscriber_id, status);

-- Drives the daily reminder sweep: find everything won, unclaimed, and with a
-- known deadline. Partial so it stays small as claimed/expired rows accumulate.
create index if not exists idx_user_tickets_deadline
  on public.user_tickets (claim_deadline)
  where status = 'won_unclaimed' and claim_deadline is not null;

alter table public.user_tickets enable row level security;

-- Service-role only, like every other account table (0004/0006). Reached
-- exclusively from server-side route handlers. The grant is NOT optional:
-- RLS plus a bare revoke leaves service_role without table privileges and
-- every query fails with "permission denied" (learned the hard way in 0011).
revoke all on public.user_tickets from anon, authenticated;
grant select, insert, update, delete on public.user_tickets to service_role;
grant usage, select on all sequences in schema public to service_role;
