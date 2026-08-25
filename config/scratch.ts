/**
 * The 5 Canadian scratch-ticket agencies Lottizen tracks. Kept in sync with
 * scripts/calculate_rankings.py's AGENCY_META — same slugs, same scoring
 * method / data-completeness classification on both sides.
 */
export type Province = "ontario" | "british-columbia" | "western" | "atlantic" | "quebec";
export type ScoringMethod = "retention" | "remaining_value_index" | "top_prize_fraction";
export type DataCompleteness = "full" | "top_prizes_only" | "remaining_counts_only";

export interface ProvinceConfig {
  slug: Province;
  agency: string;
  label: string;
  shortLabel: string;
  scoringMethod: ScoringMethod;
  dataCompleteness: DataCompleteness;
  /** Short badge text for the data-completeness pill shown on ranking pages. */
  completenessBadge: string;
}

export const PROVINCES: ProvinceConfig[] = [
  {
    slug: "ontario",
    agency: "OLG",
    label: "Ontario",
    shortLabel: "ON",
    scoringMethod: "retention",
    dataCompleteness: "full",
    completenessBadge: "Full tier data",
  },
  {
    slug: "british-columbia",
    agency: "BCLC",
    label: "British Columbia",
    shortLabel: "BC",
    scoringMethod: "retention",
    dataCompleteness: "full",
    completenessBadge: "Full tier data",
  },
  {
    slug: "quebec",
    agency: "QUEBEC",
    label: "Quebec",
    shortLabel: "QC",
    scoringMethod: "retention",
    dataCompleteness: "full",
    completenessBadge: "Full tier data",
  },
  {
    slug: "western",
    agency: "WCLC",
    label: "Western Canada (AB / SK / MB)",
    shortLabel: "West",
    scoringMethod: "remaining_value_index",
    dataCompleteness: "remaining_counts_only",
    completenessBadge: "Remaining counts only",
  },
  {
    slug: "atlantic",
    agency: "ALC",
    label: "Atlantic Canada (NB / NS / PE / NL)",
    shortLabel: "Atlantic",
    scoringMethod: "top_prize_fraction",
    dataCompleteness: "top_prizes_only",
    completenessBadge: "Top prizes only",
  },
];

export const PROVINCE_SLUGS = PROVINCES.map((p) => p.slug);

export function isProvince(slug: string): slug is Province {
  return (PROVINCE_SLUGS as string[]).includes(slug);
}

export function provinceConfig(slug: Province): ProvinceConfig {
  const p = PROVINCES.find((p) => p.slug === slug);
  if (!p) throw new Error(`Unknown province slug: ${slug}`);
  return p;
}

/** Agency code (e.g. "BCLC") -> its province slug. Every agency maps to
 * exactly one province in this build (see PROVINCES above). */
export function provinceForAgency(agency: string): Province | undefined {
  return PROVINCES.find((p) => p.agency === agency)?.slug;
}

/** Ticket prices observed across all 5 provinces (union); each province's
 * page filters to whichever of these it actually has games at. */
export const PRICE_POINTS = [1, 2, 3, 4, 5, 7, 10, 20, 25, 30, 50, 100] as const;
