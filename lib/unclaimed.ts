/**
 * Build-time access to data/unclaimed/canada.json, written daily by
 * scripts/unclaimed.py from the agencies' official unclaimed-prize lists.
 *
 * Honesty rules for everything built on this: amounts, draw dates and
 * locations are exactly as each agency lists them; each list's own date is
 * shown next to it, because a prize can be claimed after the list was last
 * updated; a prize that drops off a list is "no longer listed", never
 * "claimed" — the agencies don't say why a prize leaves their list.
 */
import data from "@/data/unclaimed/canada.json";

export interface UnclaimedPrize {
  agency: string;
  game: string;
  drawDate: string;
  amount: number;
  location: string | null;
  expires: string;
  sourceUrl: string;
  listAsOf: string | null;
  /** Loto-Québec only: prize category and, for a shared prize, which share
   *  is unclaimed ("7/7, 1 of 3 shares") — the amount is that share. */
  detail?: string | null;
  firstSeen: string;
  removedOn?: string;
  removedBeforeDeadline?: boolean;
}

export interface UnclaimedData {
  generatedAt: string;
  asOfDate: string;
  minAmount: number;
  agencies: { agency: string; name: string; url: string; ok: boolean; listAsOf: string | null; error: string | null }[];
  notCovered: { agency: string; name: string; reason: string }[];
  prizes: UnclaimedPrize[];
  noLongerListed: UnclaimedPrize[];
}

export function getUnclaimed(): UnclaimedData {
  return data as UnclaimedData;
}
