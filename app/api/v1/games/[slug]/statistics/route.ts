import { getStats } from "@/lib/draws";
import { apiError, apiGameOrNull, apiOk, apiOptions, checkRapidApiSecret } from "@/lib/api";

/**
 * GET /api/v1/games/{slug}/statistics — number frequency, hot/cold, gap
 * (overdue) tracking, and common pairs for a game. Digit games (Pick 3/4,
 * Numbers, Win 4) return a positional-digit shape instead of a number pool.
 */
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const authError = checkRapidApiSecret(req);
  if (authError) return authError;

  const game = apiGameOrNull(params.slug);
  if (!game) {
    return apiError(404, "GAME_NOT_FOUND", `No live game found for slug '${params.slug}'.`);
  }
  const stats = getStats(params.slug);
  if (!stats) {
    return apiError(404, "STATS_NOT_FOUND", `No statistics available for '${params.slug}'.`);
  }
  return apiOk(stats);
}

export const OPTIONS = apiOptions;
