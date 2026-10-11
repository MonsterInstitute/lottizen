import { getRankings } from "@/lib/data";
import type { Game } from "@/lib/types";
import type { Province } from "@/config/scratch";
import { money } from "@/lib/format";
import { isAnnuityLabel } from "@/components/home/text";

// WCLC sells some games in one province only (games.sold_in).
const REGION_CODES: Record<string, string[]> = {
  alberta: ["AB"],
  saskatchewan: ["SK"],
  manitoba: ["MB"],
  territories: ["YT", "NT", "NU"],
};

export function scratchTopPrize(g: Game): string {
  if (isAnnuityLabel(g.topPrizeLabel)) return g.topPrizeLabel.replace(/\s+/g, " ");
  return money(g.topPrizeAmount);
}

/** The region's scratch board at a glance: its highest-ranked tickets that
 *  are on sale there, with the top prizes still unclaimed (the homepage's
 *  scratch card, ProvinceBlock PickCard). Rank describes prize money left
 *  (see /methodology), never odds. */
export function scratchTop(region: string, scratchSlug: string): Game[] {
  const r = getRankings(scratchSlug as Province);
  const codes = REGION_CODES[region];
  const sold = (g: Game) => !codes || !g.soldIn?.length || g.soldIn.some((c) => codes.includes(c));
  const anyFlag = r.games.some((g) => g.onSale != null);
  return r.games.filter((g) => (anyFlag ? g.onSale === true : true) && sold(g) && g.topPrizesRemaining > 0).slice(0, 5);
}
