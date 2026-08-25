import { getGameBySlug } from "@/lib/data";
import { isProvince } from "@/config/scratch";
import { apiError, apiOk, apiOptions, checkRapidApiSecret } from "@/lib/api";

/** GET /api/v1/scratch/{province}/{slug} — a single scratch ticket's full prize-tier breakdown. */
export async function GET(req: Request, { params }: { params: { province: string; slug: string } }) {
  const authError = checkRapidApiSecret(req);
  if (authError) return authError;

  if (!isProvince(params.province)) {
    return apiError(404, "PROVINCE_NOT_FOUND", `Unknown province '${params.province}'.`);
  }
  const game = getGameBySlug(params.province, params.slug);
  if (!game) {
    return apiError(404, "GAME_NOT_FOUND", `No scratch ticket found for slug '${params.slug}' in ${params.province}.`);
  }
  return apiOk(game);
}

export const OPTIONS = apiOptions;
