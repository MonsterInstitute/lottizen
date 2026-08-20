/**
 * Shared constants/validation for the subscription system — used by both the
 * preferences page (rendering grouped checkboxes + defaults) and the API
 * routes (validating what a client submits).
 */
import { LIVE_GAMES, type GameConfig } from "@/config/games";
import { hasData } from "@/lib/draws";

export type PrefCountry = "CA" | "US" | "EU" | "UK";

export const PREF_COUNTRIES: { code: PrefCountry; label: string }[] = [
  { code: "CA", label: "Canada" },
  { code: "US", label: "United States" },
  { code: "EU", label: "Europe (EuroMillions / EuroJackpot)" },
  { code: "UK", label: "United Kingdom (UK Lotto)" },
];

/** Pre-checked on the preferences page for a subscriber's chosen region. */
export const DEFAULT_GAMES: Record<PrefCountry, string[]> = {
  CA: ["lotto-max", "lotto-6-49"],
  US: ["powerball", "mega-millions"],
  EU: ["euromillions", "eurojackpot"],
  UK: ["uk-lotto"],
};

// UK Lotto is config/games.ts country "EU" (Europe, for site nav purposes),
// but split into its own preference bucket — a UK Lotto-only subscriber
// shouldn't default into EuroMillions/EuroJackpot just because of that.
export function bucketFor(g: GameConfig): PrefCountry {
  if (g.slug === "uk-lotto") return "UK";
  return g.country as PrefCountry;
}

export interface SubscribeGame {
  slug: string;
  name: string;
  bucket: PrefCountry;
}

function subscribableGames(): SubscribeGame[] {
  return LIVE_GAMES.filter((g) => hasData(g.slug)).map((g) => ({ slug: g.slug, name: g.name, bucket: bucketFor(g) }));
}

export function gamesByBucket(): Record<PrefCountry, SubscribeGame[]> {
  const out: Record<PrefCountry, SubscribeGame[]> = { CA: [], US: [], EU: [], UK: [] };
  for (const g of subscribableGames()) out[g.bucket].push(g);
  return out;
}

export function isValidGameSlug(slug: string): boolean {
  return LIVE_GAMES.some((g) => g.slug === slug);
}

export function isValidCountry(c: string): c is PrefCountry {
  return (["CA", "US", "EU", "UK"] as const).includes(c as PrefCountry);
}

export const FREQUENCIES = ["instant", "weekly", "both"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export function isValidFrequency(f: string): f is Frequency {
  return (FREQUENCIES as readonly string[]).includes(f);
}

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  instant: "Email me the moment a game I follow draws",
  weekly: "Sunday weekly digest only",
  both: "Both — instant results and the weekly digest",
};

/** Shared combination validation: exactly `pick` unique numbers, each
 *  within 1..max. Used by both /api/account/combinations and
 *  /api/account/combinations/[id] (create + edit). */
export function validateCombinationNumbers(
  numbers: unknown,
  pick: number,
  max: number,
): { ok: true; numbers: number[] } | { ok: false; error: string } {
  const list = Array.isArray(numbers) ? numbers.map(Number) : [];
  const inRange = list.every((n) => Number.isInteger(n) && n >= 1 && n <= max);
  if (list.length !== pick || !inRange) {
    return { ok: false, error: `Enter exactly ${pick} numbers between 1 and ${max}.` };
  }
  if (new Set(list).size !== list.length) {
    return { ok: false, error: "Numbers must be unique — no repeats." };
  }
  return { ok: true, numbers: list };
}
