import Link from "next/link";
import { CHARITY_PROVINCES, fmtDeadline, getCharityLotteries, isOpen, lotteryPath, nextDeadline, type CharityLottery } from "@/lib/charity";
import { money } from "@/lib/format";

/** For the homepage's "This week in [province]": home lotteries with a
 *  deadline in the next 7 days, and the biggest 50/50 pot on sale now, in
 *  the region's provinces. Renders nothing when there's neither. */
export function charityWeek(region: string, now = new Date()) {
  const codes: string[] = CHARITY_PROVINCES.filter((p) => p.region === region).map((p) => p.code);
  const inRegion = (l: CharityLottery) => (l.provinces?.length ? l.provinces : [l.province]).some((c) => codes.includes(c));
  const week = now.getTime() + 7 * 86400000;
  const lots = getCharityLotteries().filter((l) => inRegion(l) && isOpen(l) && l.current);
  const deadlines = lots
    .filter((l) => l.kind !== "5050" && l.kind !== "catch_the_ace")
    .map((l) => ({ l, d: nextDeadline(l.current!, now) }))
    .filter((x) => x.d && new Date(x.d.at).getTime() <= week)
    .sort((a, b) => a.d!.at.localeCompare(b.d!.at));
  const pot = lots
    .filter((l) => (l.kind === "5050" || l.kind === "catch_the_ace") && l.current!.status === "on_sale" && l.current!.jackpot)
    .sort((a, b) => b.current!.jackpot! - a.current!.jackpot!)[0];
  return { deadlines, pot };
}

export function CharityThisWeek({ region, now = new Date() }: { region: string; now?: Date }) {
  const { deadlines, pot } = charityWeek(region, now);
  if (!deadlines.length && !pot) return null;
  const slug = CHARITY_PROVINCES.find((p) => p.region === region)?.slug;
  return (
    <div className="card home-charity" style={{ padding: "20px 24px", marginTop: 4 }}>
      <div className="section-eyebrow">Charity lotteries this week</div>
      <ul className="home-skip-list">
        {deadlines.slice(0, 4).map(({ l, d }) => (
          <li key={l.id}>
            <Link href={lotteryPath(l)}>{l.name}</Link>
            <span className="field-hint">
              {" "}
              · {d!.name}: {fmtDeadline(d!.at, l.province, false)}
            </span>
          </li>
        ))}
        {pot && (
          <li>
            Biggest 50/50 pot now: <Link href={lotteryPath(pot)}>{pot.name}</Link>{" "}
            <strong>{money(pot.current!.jackpot!)}</strong>
            {pot.current!.guarantee ? <span className="field-hint"> (guaranteed)</span> : null}
          </li>
        )}
      </ul>
      {slug && (
        <p className="field-hint" style={{ marginTop: 8 }}>
          <Link href={`/charity/${slug}`}>All charity lotteries →</Link>
        </p>
      )}
    </div>
  );
}
