import { getAllProvinceSlugs, getRankings } from "@/lib/data";
import { isProvince } from "@/config/scratch";
import { apiError, apiOk, apiOptions, checkRapidApiSecret } from "@/lib/api";

/**
 * GET /api/v1/scratch/{province} — every current scratch ticket for one of
 * the 5 tracked provinces (ontario, british-columbia, western, atlantic,
 * quebec), ranked by that province's Value Score. Not every province
 * publishes the same underlying data — see `scoringMethod` and
 * `dataCompleteness` in the response, and /methodology for what each means.
 */
export async function GET(req: Request, { params }: { params: { province: string } }) {
  const authError = checkRapidApiSecret(req);
  if (authError) return authError;

  if (!isProvince(params.province)) {
    return apiError(
      404,
      "PROVINCE_NOT_FOUND",
      `Unknown province '${params.province}'. Valid values: ${getAllProvinceSlugs().join(", ")}.`,
    );
  }

  const { games, generatedAt, source, currency, agency, province, provinceLabel, scoringMethod, dataCompleteness, gameCount } =
    getRankings(params.province);
  return apiOk(games, {
    generatedAt,
    source,
    currency,
    agency,
    province,
    provinceLabel,
    scoringMethod,
    dataCompleteness,
    gameCount,
  });
}

export const OPTIONS = apiOptions;
