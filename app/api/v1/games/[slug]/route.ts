import { apiError, apiGameOrNull, apiOk, apiOptions, checkRapidApiSecret, toApiGame } from "@/lib/api";

/** GET /api/v1/games/{slug} — a single draw-lottery game's details. */
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const authError = checkRapidApiSecret(req);
  if (authError) return authError;

  const game = apiGameOrNull(params.slug);
  if (!game) {
    return apiError(404, "GAME_NOT_FOUND", `No live game found for slug '${params.slug}'.`);
  }
  return apiOk(toApiGame(game));
}

export const OPTIONS = apiOptions;
