import { getDraws } from "@/lib/draws";
import { apiError, apiGameOrNull, apiOk, apiOptions, checkRapidApiSecret, isValidDateParam, paginate } from "@/lib/api";

/**
 * GET /api/v1/games/{slug}/draws?from=&to=&limit=&offset=
 * Historical draws, newest first. `from`/`to` are inclusive YYYY-MM-DD
 * bounds on the draw date. `limit` defaults to 50, capped at 500; `offset`
 * pages beyond that.
 */
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const authError = checkRapidApiSecret(req);
  if (authError) return authError;

  const game = apiGameOrNull(params.slug);
  if (!game) {
    return apiError(404, "GAME_NOT_FOUND", `No live game found for slug '${params.slug}'.`);
  }
  const drawsFile = getDraws(params.slug);
  if (!drawsFile) {
    return apiError(404, "DRAW_NOT_FOUND", `No draw data available for '${params.slug}'.`);
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!isValidDateParam(from) || !isValidDateParam(to)) {
    return apiError(400, "INVALID_PARAM", "`from` and `to` must be in YYYY-MM-DD format.");
  }

  const filtered = drawsFile.draws.filter((d) => (!from || d.date >= from) && (!to || d.date <= to));
  const { page, limit, offset, total, hasMore } = paginate(filtered, searchParams);

  return apiOk(page, {
    game: params.slug,
    from: from ?? null,
    to: to ?? null,
    limit,
    offset,
    total,
    hasMore,
  });
}

export const OPTIONS = apiOptions;
