import { getLatestAll, getLatestGeneratedAt } from "@/lib/draws";

export const dynamic = "force-static";

/** The latest draw date this deployment carries for each game. Read by the
 *  draw-night watcher (app/api/cron/draw-watch) to tell when a draw is live. */
export function GET() {
  const latest = Object.fromEntries(getLatestAll().map((l) => [l.slug, l.latestDate]));
  return Response.json(
    { generatedAt: getLatestGeneratedAt(), latest },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, must-revalidate", "X-Robots-Tag": "noindex" } },
  );
}
