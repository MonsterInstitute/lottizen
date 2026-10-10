/**
 * Build-time access to data/picks/canada.json (scripts/weekly_picks.py):
 * this week's pick and the skip list per province. Only games the agency
 * currently sells are ever picked or listed (games.on_sale = true).
 *
 * Wording rules (agreed 2026-10-10, CLAUDE.md): the pick is "This week's
 * pick" and always carries PICK_NOTE; it describes prize money left, never
 * odds. "Skip" is stated plainly because a top prize being gone is a fact.
 */
import data from "@/data/picks/canada.json";

export const PICK_NOTE = "This is about prize money left, not your odds.";

export interface PickGame {
  agency: string;
  game_number: string;
  slug: string;
  name: string;
  province: string;
  price: number;
  top_label: string | null;
  top_amount: number | null;
  top_total: number | null;
  top_remaining: number | null;
  share_left_pct: number | null;
  rank: number | null;
}

export interface ProvincePicks {
  province: string;
  label: string;
  agency: string;
  agencyName: string;
  onSaleKnown: boolean;
  onSaleCount: number;
  listedCount: number;
  picks: Partial<Record<"overall" | "1-5" | "10" | "20+", PickGame | null>>;
  replacements: { band: string; on: string; reason: string; old: { name: string; slug: string } }[];
  skip: PickGame[];
}

export interface PicksFile {
  generatedAt: string;
  asOf: string;
  weekStart: string;
  provinces: Record<string, ProvincePicks>;
}

export const BAND_LABEL: Record<string, string> = { "1-5": "$1–5", "10": "$6–10", "20+": "Over $10" };

export function getPicks(): PicksFile {
  return data as PicksFile;
}
