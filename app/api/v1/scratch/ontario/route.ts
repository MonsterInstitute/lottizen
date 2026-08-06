import { getRankings } from "@/lib/data";
import { apiOk, apiOptions, checkRapidApiSecret } from "@/lib/api";

/**
 * GET /api/v1/scratch/ontario — every current Ontario (OLG) scratch ticket
 * ranked by Value Score, with full prize-tier breakdowns and remaining-prize
 * counts. This is Lottizen's exclusive dataset: no other lottery API tracks
 * remaining scratch-ticket prizes.
 */
export async function GET(req: Request) {
  const authError = checkRapidApiSecret(req);
  if (authError) return authError;

  const { games, generatedAt, source, currency, province, gameCount } = getRankings();
  return apiOk(games, { generatedAt, source, currency, province, gameCount });
}

export const OPTIONS = apiOptions;
