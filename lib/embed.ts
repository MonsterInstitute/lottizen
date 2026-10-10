/**
 * Embeddable widgets (/embed/*): small, self-contained HTML documents other
 * sites drop into an <iframe>. Rendered as plain strings from route handlers,
 * not React pages, so they never pull in the site layout, its fonts, or any
 * JavaScript: one HTML response with inline CSS, nothing else to fetch. The
 * data is the same build-time JSON every page reads, so a widget always
 * matches the page its credit link points to.
 *
 * System font stacks on purpose: three webfonts would roughly double each
 * widget's weight on someone else's page. Georgia keeps the editorial serif.
 *
 * Honesty rules (CLAUDE.md) apply here like anywhere: the scratch widget ranks
 * prize money still unclaimed (not odds), and the number widget is a historical
 * count. Each says so in the widget itself, because a third-party page won't
 * carry our disclaimers.
 */
import { countrySlug, getLiveGame, type GameConfig } from "@/config/games";
import { PROVINCES, isProvince, type Province } from "@/config/scratch";
import { getRankings } from "@/lib/data";
import { getLatestAll, getNumberStat, getStats, hasData } from "@/lib/draws";
import { currentJackpot, drawDate, humanDate, money, price, resolveNextDraw } from "@/lib/format";
import { SITE } from "@/lib/site";
import type { Game } from "@/lib/types";

export type EmbedTheme = "light" | "dark";
export type EmbedKind = "latest" | "jackpot" | "scratch" | "number";

/** Data changes once a day (scrape + rebuild); the CDN copy is dropped on
 *  every deploy anyway. Browsers may hold a copy for an hour. */
const CACHE_CONTROL = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

export function themeFrom(req: Request): EmbedTheme {
  return new URL(req.url).searchParams.get("theme") === "dark" ? "dark" : "light";
}

function esc(s: string | number): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const pad = (n: number) => String(n).padStart(2, "0");

const CSS = `
:root{--bg:#fff;--panel:#f7f4ed;--border:#e6e0d4;--ink:#1a1815;--ink-2:#6d685f;--ink-3:#9c968a;--brand:#dd8232;--brand-deep:#c2652a}
.dark{--bg:#1f1d1a;--panel:#2a2723;--border:#3a362f;--ink:#f3efe6;--ink-2:#bdb6a8;--ink-3:#8f897d;--brand:#e8924a;--brand-deep:#f0a868}
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%}
body{font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:transparent;-webkit-font-smoothing:antialiased}
.w{min-height:100%;display:flex;flex-direction:column;gap:10px;padding:14px 16px 12px;border:1px solid var(--border);border-radius:14px;background:var(--bg);overflow:hidden}
.eb{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--brand)}
h1{font:700 19px/1.2 Georgia,"Times New Roman",serif;letter-spacing:-.01em}
h1 em{font-style:italic;color:var(--brand-deep)}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.balls{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.ball{display:inline-flex;align-items:center;justify-content:center;width:31px;height:31px;border-radius:50%;border:1px solid var(--border);background:var(--panel);font:500 13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--ink)}
.ball.b{background:var(--brand);border-color:var(--brand);color:#fff}
.ball.s{background:var(--brand-deep);border-color:var(--brand-deep);color:#fff}
.ball.xl{width:52px;height:52px;font-size:20px}
.plus{color:var(--ink-3);font:13px ui-monospace,monospace}
.meta{font-size:12.5px;color:var(--ink-2)}
.meta b{color:var(--ink);font-weight:600}
.big{font:800 34px/1.05 Georgia,"Times New Roman",serif;letter-spacing:-.02em}
.row{display:flex;gap:10px;align-items:baseline;padding:7px 0;border-top:1px solid var(--border)}
.row:first-child{border-top:0;padding-top:0}
.rk{font:600 12px ui-monospace,monospace;color:var(--brand-deep);min-width:18px}
.nm{flex:1;min-width:0;font:600 14px/1.25 Georgia,serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nm small{display:block;font:400 11.5px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink-2);white-space:normal}
.pr{font:600 13px ui-monospace,monospace}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.tile{background:var(--panel);border-radius:10px;padding:8px 9px}
.tile .k{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-3);font-weight:600}
.tile .v{font:600 17px ui-monospace,monospace;margin-top:2px}
.tile .f{font-size:10.5px;color:var(--ink-2)}
.note{font-size:11px;color:var(--ink-3);line-height:1.35}
.cr{margin-top:auto;padding-top:8px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--ink-3)}
.cr a{color:var(--brand-deep);font-weight:600;text-decoration:none}
.cr a:hover{text-decoration:underline}
`.replace(/\n/g, "");

function page(opts: { title: string; theme: EmbedTheme; body: string; credit: string; asOf?: string }): string {
  return (
    `<!doctype html><html lang="en"${opts.theme === "dark" ? ' class="dark"' : ""}><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">` +
    // Every link opens in a new tab: navigating inside a 300px iframe would
    // strand the reader in a sliver of someone else's page.
    `<base target="_blank"><title>${esc(opts.title)}</title><style>${CSS}</style></head>` +
    `<body><div class="w">${opts.body}` +
    `<div class="cr"><a href="${esc(SITE.url + opts.credit)}" rel="noopener">Data by Lottizen</a>` +
    `${opts.asOf ? `<span>${esc(opts.asOf)}</span>` : ""}</div></div></body></html>`
  );
}

function respond(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": status === 200 ? CACHE_CONTROL : "public, max-age=300, s-maxage=300",
      // Framing by any site is the point; nothing inside needs to load.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors *; base-uri 'self'",
      "X-Robots-Tag": "noindex",
    },
  });
}

function notFound(theme: EmbedTheme, what: string): Response {
  return respond(
    page({ title: "Widget not found", theme, credit: "/embed", body: `<div class="meta">${esc(what)} isn&rsquo;t available as a widget.</div>` }),
    404,
  );
}

function liveGame(slug: string): GameConfig | undefined {
  const g = getLiveGame(slug);
  return g && hasData(g.slug) ? g : undefined;
}

function ballsHtml(g: GameConfig, numbers: number[], bonus?: number | null, bonus2?: number | null): string {
  const digit = g.format === "digit";
  const main = numbers.map((n) => `<span class="ball">${digit ? n : pad(n)}</span>`).join("");
  const sec = [bonus, bonus2].filter((b): b is number => b != null);
  if (!sec.length) return `<div class="balls">${main}</div>`;
  const cls = bonus2 != null ? "s" : "b";
  const label = esc(g.bonusLabel ?? "Bonus");
  return (
    `<div class="balls">${main}<span class="plus" aria-hidden="true">+</span>` +
    sec.map((b) => `<span class="ball ${cls}" title="${label}">${pad(b)}</span>`).join("") +
    `</div>`
  );
}

function jackpotOf(g: GameConfig) {
  const l = getLatestAll().find((x) => x.slug === g.slug);
  const amount = currentJackpot(g, l);
  return { latest: l, amount, nextDraw: resolveNextDraw(l?.nextDraw, g.drawDays) };
}

// ---------------------------------------------------------------- widgets

export function latestWidget(slug: string, theme: EmbedTheme): Response {
  const g = liveGame(slug);
  if (!g) return notFound(theme, "That game");
  const { latest, amount, nextDraw } = jackpotOf(g);
  if (!latest) return notFound(theme, "That game");
  const next =
    `<div class="meta">Next draw <b>${esc(drawDate(nextDraw))}</b>` +
    (amount != null ? ` · Est. jackpot <b>${esc(money(amount, { compact: true, currency: g.currency }))}</b>` : "") +
    `</div>`;
  const body =
    `<div class="eb">${esc(g.name)} · Winning numbers</div>` +
    `<h1>${esc(drawDate(latest.latestDate))}</h1>` +
    ballsHtml(g, latest.numbers, latest.bonus, latest.bonus2) +
    next;
  return respond(
    page({ title: `${g.name} winning numbers`, theme, body, credit: `/${countrySlug(g.country)}/${g.slug}/results` }),
  );
}

export function jackpotWidget(slug: string, theme: EmbedTheme): Response {
  const g = liveGame(slug);
  if (!g) return notFound(theme, "That game");
  const { amount, nextDraw } = jackpotOf(g);
  // An embed outlives the build that chose it: if the operator stops
  // publishing an estimate, say so rather than show an old figure.
  const figure =
    amount != null
      ? `<div class="big">${esc(money(amount, { compact: true, currency: g.currency }))}</div><div class="meta">Estimated jackpot, as published by the operator</div>`
      : `<div class="meta">No jackpot estimate published for this draw yet.</div>`;
  const body =
    `<div class="eb">${esc(g.name)} · Next draw</div>` +
    `<h1>${esc(drawDate(nextDraw))}</h1>` +
    figure;
  return respond(page({ title: `${g.name} jackpot`, theme, body, credit: `/${countrySlug(g.country)}/${g.slug}` }));
}

/** WCLC publishes no printed counts, so its line has no "of N". */
function scratchLine(g: Game): string {
  const label = g.topPrizeLabel.replace(/\.00\b/, ""); // OLG writes "$50,000.00"
  return g.scoringMethod === "remaining_value_index"
    ? `${g.topPrizesRemaining.toLocaleString("en-CA")} top prizes (${label}) left`
    : `${g.topPrizesRemaining} of ${g.topPrizesTotal} top prizes (${label}) left`;
}

const SCRATCH_NOTE: Record<Game["scoringMethod"], string> = {
  retention: "Ranked by how much prize money is still unclaimed relative to how many prizes are left. It doesn&rsquo;t change any ticket&rsquo;s odds.",
  remaining_value_index:
    "Ranked by unclaimed prize money per $1 of ticket price (WCLC publishes remaining prizes only). It doesn&rsquo;t change any ticket&rsquo;s odds.",
  top_prize_fraction:
    "Ranked by share of top prizes still unclaimed (ALC publishes top-prize counts only). It doesn&rsquo;t change any ticket&rsquo;s odds.",
};

export function scratchWidget(province: string, theme: EmbedTheme): Response {
  if (!isProvince(province)) return notFound(theme, "That province");
  const cfg = PROVINCES.find((p) => p.slug === province)!;
  const r = getRankings(province as Province);
  const top = r.games.slice(0, 3);
  if (!top.length) return notFound(theme, "That province");
  const rows = top
    .map(
      (g, i) =>
        `<div class="row"><span class="rk">${pad(i + 1)}</span>` +
        `<span class="nm">${esc(g.name)}<small>${esc(scratchLine(g))}</small></span>` +
        `<span class="pr">${esc(price(g.price))}</span></div>`,
    )
    .join("");
  const body =
    `<div class="eb">${esc(cfg.label.split(" (")[0])} · Scratch tickets</div>` +
    `<h1>Top 3 by <em>prize money left</em></h1>` +
    `<div>${rows}</div>` +
    `<div class="note">${SCRATCH_NOTE[r.scoringMethod]}</div>`;
  return respond(
    page({
      title: `${cfg.label} scratch tickets: top 3 by remaining prizes`,
      theme,
      body,
      credit: `/scratch/${province}`,
      asOf: `Updated ${humanDate(r.generatedAt)}`,
    }),
  );
}

export function numberWidget(slug: string, nRaw: string, theme: EmbedTheme): Response {
  const g = liveGame(slug);
  const stats = g ? getStats(g.slug) : undefined;
  const n = Number(nRaw);
  if (!g || g.format === "digit" || !stats || !Number.isInteger(n) || n < 1 || n > stats.max)
    return notFound(theme, "That number");
  const s = getNumberStat(g.slug, n);
  if (!s) return notFound(theme, "That number");
  const since = s.newSince ?? stats.statsFrom ?? stats.dataSince;
  const body =
    `<div class="eb">${esc(g.name)} · Number history</div>` +
    `<div style="display:flex;gap:12px;align-items:center"><span class="ball b xl">${pad(n)}</span>` +
    `<div><h1>Number ${n}</h1><div class="meta">${since ? `Draws since ${esc(drawDate(since))}` : "All recorded draws"}</div></div></div>` +
    `<div class="tiles">` +
    `<div class="tile"><div class="k">Drawn</div><div class="v">${s.count}</div><div class="f">times</div></div>` +
    `<div class="tile"><div class="k">Last seen</div><div class="v">${s.currentGap}</div><div class="f">draw${s.currentGap === 1 ? "" : "s"} ago</div></div>` +
    `<div class="tile"><div class="k">Longest gap</div><div class="v">${s.maxGap}</div><div class="f">draws</div></div>` +
    `</div>` +
    `<div class="note">Past results only. Every number has the same chance in every draw.</div>`;
  return respond(
    page({ title: `${g.name} number ${n} history`, theme, body, credit: `/${countrySlug(g.country)}/${g.slug}/number/${n}` }),
  );
}

// ---------------------------------------------------------- configurator

export interface EmbedGameOption {
  slug: string;
  name: string;
  /** Widget kinds this game supports today. */
  kinds: EmbedKind[];
  /** Highest number in the main pool, for the number picker (pool games only). */
  max: number | null;
  /** iframe heights (px) that fit the content at a 280px-wide frame. */
  heights: Partial<Record<EmbedKind, number>>;
}

export interface EmbedCatalog {
  countries: { code: string; slug: string; name: string; games: EmbedGameOption[] }[];
  provinces: { slug: string; label: string }[];
  scratchHeight: number;
}

export function embedCatalog(countries: { code: string; slug: string; name: string }[]): EmbedCatalog {
  const latestAll = getLatestAll();
  return {
    countries: countries.map((c) => ({
      ...c,
      games: latestAll
        .map((l) => liveGame(l.slug))
        .filter((g): g is GameConfig => !!g && g.country === c.code)
        .map((g) => {
          const l = latestAll.find((x) => x.slug === g.slug)!;
          const balls = l.numbers.length + [l.bonus, l.bonus2].filter((b) => b != null).length;
          // Heights are sized for the narrowest frame we support (280px):
          // 6 balls per row there, the "+" takes about half a slot, and the
          // text lines may wrap once. Wider frames just get a little air.
          const rows = Math.ceil((balls + (balls > l.numbers.length ? 0.5 : 0)) / 6);
          const kinds: EmbedKind[] = ["latest"];
          if (jackpotOf(g).amount != null) kinds.push("jackpot");
          const pool = g.format !== "digit" ? getStats(g.slug)?.max ?? null : null;
          if (pool) kinds.push("number");
          return {
            slug: g.slug,
            name: g.name,
            kinds,
            max: pool,
            heights: { latest: 176 + rows * 37, jackpot: 206, number: 292 },
          };
        }),
    })),
    provinces: PROVINCES.map((p) => ({ slug: p.slug, label: p.label })),
    scratchHeight: 352,
  };
}
