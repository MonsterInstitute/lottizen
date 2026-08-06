import { getLatestAll } from "@/lib/draws";
import { apiError, apiGameOrNull, apiOk, apiOptions, checkRapidApiSecret } from "@/lib/api";

/** GET /api/v1/games/{slug}/latest — the most recent draw for a game. */
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const authError = checkRapidApiSecret(req);
  if (authError) return authError;

  const game = apiGameOrNull(params.slug);
  if (!game) {
    return apiError(404, "GAME_NOT_FOUND", `No live game found for slug '${params.slug}'.`);
  }
  const latest = getLatestAll().find((l) => l.slug === params.slug);
  if (!latest) {
    return apiError(404, "DRAW_NOT_FOUND", `No draw data available for '${params.slug}'.`);
  }
  return apiOk(latest);
}

export const OPTIONS = apiOptions;
