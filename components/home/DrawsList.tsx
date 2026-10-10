import Link from "next/link";
import { countrySlug, getGame } from "@/config/games";
import { getLatestAll } from "@/lib/draws";
import { drawDate, money, resolveNextDraw } from "@/lib/format";
import { Balls } from "@/components/draws/Balls";

/** Next draw (and jackpot where the operator publishes one) plus the latest
 *  numbers, for the given games. */
export function DrawsList({ slugs, title }: { slugs: string[]; title: string }) {
  const latest = new Map(getLatestAll().map((l) => [l.slug, l]));
  const rows = slugs
    .map((s) => ({ g: getGame(s), l: latest.get(s) }))
    .filter((x): x is { g: NonNullable<typeof x.g>; l: NonNullable<typeof x.l> } => Boolean(x.g && x.l));
  return (
    <div className="card home-draws">
      <div className="section-eyebrow">{title}</div>
      <ul className="home-draw-list">
        {rows.map(({ g, l }) => {
          const next = resolveNextDraw(l.nextDraw, g.drawDays);
          // The operator's jackpot belongs to the draw it was published for.
          // If that draw has passed and the results aren't in yet, the next
          // draw's jackpot is unknown (it resets if someone won), so show none.
          const jp =
            g.progressive && l.nextJackpot != null && l.nextDraw === next
              ? money(l.nextJackpot, { compact: true, currency: g.currency })
              : null;
          return (
            <li key={g.slug}>
              <div className="home-draw-head">
                <Link href={`/${countrySlug(g.country)}/${g.slug}`} className="home-draw-name">
                  {g.name}
                </Link>
                <span className="home-draw-next">
                  Next draw {drawDate(next)}
                  {jp ? <strong> · {jp}</strong> : null}
                </span>
              </div>
              <div className="home-draw-last">
                <span className="field-hint">{drawDate(l.latestDate)}</span>
                <Balls numbers={l.numbers} bonus={l.bonus} bonus2={l.bonus2} size="sm" />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
