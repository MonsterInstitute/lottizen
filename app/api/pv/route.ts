import { pageKind } from "@/lib/page-kind";

export const dynamic = "force-dynamic";

const BOT = /bot|crawl|spider|slurp|inspectiontool|lighthouse|headless|preview|fetch|curl|python|monitor/i;

/** POST /api/pv {path} — counts one page view per day per path in
 *  page_views_daily (no cookies, no IP, nothing personal stored). */
export async function POST(req: Request) {
  const ua = req.headers.get("user-agent") || "";
  if (BOT.test(ua)) return new Response(null, { status: 204 });
  let path = "";
  try {
    path = String((await req.json()).path || "");
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!path.startsWith("/") || path.length > 300 || path.startsWith("/api/")) return new Response(null, { status: 400 });
  path = path.split("?")[0].split("#")[0];
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    await fetch(`${url}/rest/v1/rpc/pv_hit`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_path: path, p_kind: pageKind(path) }),
      cache: "no-store",
    }).catch(() => {});
  }
  return new Response(null, { status: 204 });
}
