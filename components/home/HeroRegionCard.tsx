import Link from "next/link";
import { countrySlug, getGame } from "@/config/games";
import { getLatestAll } from "@/lib/draws";
import { currentJackpot, drawDate, money, resolveNextDraw } from "@/lib/format";
import { Balls } from "@/components/draws/Balls";

/**
 * The hero's data card for one region: its headline game's latest numbers,
 * the next draw (with a jackpot only if it's the one published for that
 * draw), its other games at a glance, and links straight into the tools.
 * Every region's card is in the HTML (data-region-block); the browser shows
 * the visitor's — see components/home/RegionScript.tsx.
 */
export function HeroRegionCard({
  region,
  label,
  games,
  scratchSlug,
}: {
  region: string;
  label: string;
  games: string[];
  scratchSlug?: string;
}) {
  const latest = new Map(getLatestAll().map((l) => [l.slug, l]));
  const rows = games
    .map((s) => ({ g: getGame(s), l: latest.get(s) }))
    .filter((x): x is { g: NonNullable<typeof x.g>; l: NonNullable<typeof x.l> } => Boolean(x.g && x.l));
  if (!rows.length) return null;
  const [lead, ...rest] = rows;
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
      <Balls numbers={lead.l.numbers} bonus={lead.l.bonus} bonus2={lead.l.bonus2} size="lg" />
      <div className="game-card-jackpot">
        <span className="lbl">Next draw</span>
        <span className="amt">{nextOf(lead.g, lead.l)}</span>
      </div>
      {rest.map(({ g, l }) => (
        <div className="data-row" key={g.slug}>
          <Link href={`/${countrySlug(g.country)}/${g.slug}`} className="k" style={{ color: "inherit" }}>
            {g.name}
          </Link>
          <span className="v">{nextOf(g, l)}</span>
        </div>
      ))}
      <div className="data-card-foot hero-tools">
        <Link href={`${base}/statistics`}>Statistics</Link>
        <Link href="/generator">Number tools</Link>
        <Link href={`${base}/results`}>History</Link>
        {scratchSlug ? <Link href={`/scratch/${scratchSlug}`}>Scratch rankings</Link> : <Link href={`/${countrySlug(lead.g.country)}`}>All games</Link>}
      </div>
    </div>
  );
}
