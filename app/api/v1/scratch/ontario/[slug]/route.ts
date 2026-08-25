import { getGameBySlug } from "@/lib/data";
import { apiError, apiOk, apiOptions, checkRapidApiSecret } from "@/lib/api";

/** GET /api/v1/scratch/ontario/{slug} — a single Ontario scratch ticket's full prize-tier breakdown. */
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const authError = checkRapidApiSecret(req);
  if (authError) return authError;

  const game = getGameBySlug("ontario", params.slug);
  if (!game) {
    return apiError(404, "GAME_NOT_FOUND", `No Ontario scratch ticket found for slug '${params.slug}'.`);
  }
  return apiOk(game);
}

export const OPTIONS = apiOptions;
