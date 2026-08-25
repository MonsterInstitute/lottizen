import { getRankings } from "@/lib/data";
import { apiOk, apiOptions, checkRapidApiSecret } from "@/lib/api";

/**
 * GET /api/v1/scratch/ontario — every current Ontario (OLG) scratch ticket
 * ranked by Value Score, with full prize-tier breakdowns and remaining-prize
 * counts. Kept as a stable, backward-compatible alias of
 * /api/v1/scratch/ontario (the general form — see [province]/route.ts) for
 * existing RapidAPI subscribers; both return identical data for Ontario.
 */
export async function GET(req: Request) {
  const authError = checkRapidApiSecret(req);
  if (authError) return authError;

  const { games, generatedAt, source, currency, province, gameCount } = getRankings("ontario");
  return apiOk(games, { generatedAt, source, currency, province, gameCount });
}

export const OPTIONS = apiOptions;
