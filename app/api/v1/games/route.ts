import { LIVE_GAMES } from "@/config/games";
import { hasData } from "@/lib/draws";
import { apiOk, apiOptions, checkRapidApiSecret, toApiGame } from "@/lib/api";

/**
 * GET /api/v1/games — every live, data-backed draw-lottery game: country,
 * agency, number-pool rules, ticket price, and draw days. Scratch tickets
 * are served separately under /api/v1/scratch/ontario.
 */
export async function GET(req: Request) {
  const authError = checkRapidApiSecret(req);
  if (authError) return authError;

  const games = LIVE_GAMES.filter((g) => hasData(g.slug)).map(toApiGame);
  return apiOk(games, { total: games.length });
}

export const OPTIONS = apiOptions;
