import Link from "next/link";
import { countrySlug, getGame } from "@/config/games";
import { getLatestAll } from "@/lib/draws";
import { currentJackpot, drawDate, money, resolveNextDraw } from "@/lib/format";
import { Balls } from "@/components/draws/Balls";

/**
 * The hero's data card for one region: its headline game's latest numbers
 * and the next draws of the region's games (with a jackpot only if it's the
 * one published for that draw). The results section below leaves the
 * headline game out, so its numbers show once.
 * Every region's card is in the HTML (data-region-block); the browser shows
 * the visitor's — see components/home/RegionScript.tsx.
 */
export function HeroRegionCard({
  region,
  label,
  games,
}: {
  region: string;
  label: string;
  games: string[];
}) {
  const latest = new Map(getLatestAll().map((l) => [l.slug, l]));
  const rows = games
    .map((s) => ({ g: getGame(s), l: latest.get(s) }))
    .filter((x): x is { g: NonNullable<typeof x.g>; l: NonNullable<typeof x.l> } => Boolean(x.g && x.l));
  if (!rows.length) return null;
  const lead = rows[0];
  const base = `/${countrySlug(lead.g.country)}/${lead.g.slug}`;
  const nextOf = (g: typeof lead.g, l: typeof lead.l) => {
    const j = currentJackpot(g, l);
    return `${drawDate(resolveNextDraw(l.nextDraw, g.drawDays))}${j != null ? ` · ${money(j, { compact: true, currency: g.currency })}` : ""}`;
  };
  return (
    <div className="data-card hero-region-card" data-region-block={region}>
      <div className="data-card-head">
        <Link href={base} className="data-card-title">
          {lead.g.name}
        </Link>
        <span className="status-pill">{label}</span>
      </div>
      <div className="game-card-date" style={{ marginTop: 14, marginBottom: 12 }}>
        {drawDate(lead.l.latestDate)}
      </div>
      <Balls numbers={lead.l.numbers} bonus={lead.l.bonus} bonus2={lead.l.bonus2} size="lg" fit />
      <div className="data-row hero-next-head">
        <span className="k">Next draws</span>
      </div>
      {rows.map(({ g, l }) => (
        <div className="data-row" key={g.slug}>
          <Link href={`/${countrySlug(g.country)}/${g.slug}`} className="k" style={{ color: "inherit" }}>
            {g.name}
          </Link>
          <span className="v">{nextOf(g, l)}</span>
        </div>
      ))}
    </div>
  );
}
