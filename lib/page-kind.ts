/** Which kind of page a path is, for traffic and signup-source reporting
 *  (page_views_daily.kind, subscribers.signup_kind). */
export function pageKind(path: string): string {
  const p = path.split("?")[0].replace(/\/+$/, "") || "/";
  if (p === "/") return "home";
  if (/^\/charity\/[^/]+\/[^/]+\/winning-numbers/.test(p) || p.startsWith("/winning-numbers")) return "charity-winning-numbers";
  if (p.startsWith("/charity")) return "charity";
  if (p.startsWith("/picks")) return "scratch-picks";
  if (/^\/scratch\/[^/]+\/prices/.test(p)) return "scratch-prices";
  if (p.startsWith("/scratch")) return "scratch";
  if (p.startsWith("/news/did-anyone-win")) return "draw-did-anyone-win";
  if (p.startsWith("/news")) return "news";
  if (p.startsWith("/statistics") || /\/statistics/.test(p)) return "statistics";
  if (p.startsWith("/generator") || /\/generator$/.test(p)) return "tools";
  if (/^\/(canada|usa|europe)\/[^/]+\/results/.test(p)) return "draw-results";
  if (/^\/(canada|usa|europe)\/[^/]+/.test(p)) return "draw-game";
  if (/^\/(canada|usa|europe)$/.test(p)) return "draw-country";
  if (p.startsWith("/guides")) return "guides";
  if (p.startsWith("/unclaimed")) return "unclaimed";
  if (p.startsWith("/dashboard") || p.startsWith("/subscribe")) return "account";
  return "other";
}
