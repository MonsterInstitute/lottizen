import Link from "next/link";
import { BAND_LABEL, PICK_NOTE, type PickGame, type ProvincePicks } from "@/lib/picks";
import { drawDate, money } from "@/lib/format";
import { isAnnuityLabel } from "@/components/home/text";

function topPrize(g: PickGame): string {
  if (g.top_label && isAnnuityLabel(g.top_label)) return g.top_label.replace(/\s+/g, " ");
  return g.top_amount != null ? money(g.top_amount) : (g.top_label ?? "top prize");
}

/** "It still has 3 of its 4 top prizes ($675,000) and 82% of its printed
 *  prize money unclaimed." Every figure is from the agency's published
 *  counts; WCLC publishes no printed totals and ALC only top-prize counts,
 *  so those sentences say less rather than estimate. */
export function pickReason(g: PickGame): string {
  const left = g.top_remaining ?? 0;
  const tops =
    g.top_total != null
      ? left === g.top_total
        ? `all ${g.top_total} of its top prizes (${topPrize(g)})`
        : `${left} of its ${g.top_total} top prizes (${topPrize(g)})`
      : `${left} top prize${left === 1 ? "" : "s"} (${topPrize(g)}) unclaimed`;
  const share = g.share_left_pct != null ? ` and ${g.share_left_pct}% of its printed prize money unclaimed` : "";
  return `It still has ${tops}${share}.`;
}

/** Why this ticket ranks first, in the terms of the scoring method this
 *  agency's data supports (see /methodology) — never "better odds". */
function whyFirst(p: ProvincePicks): string {
  const among = `the ${p.onSaleCount} ${p.agencyName} scratch tickets on sale`;
  if (p.agency === "WCLC") return `It has the most disclosed prize money still unclaimed per $1 of ticket price among ${among}.`;
  if (p.agency === "ALC")
    return `It has the highest share of its top prizes still unclaimed among ${among} (ties go to the one with the most top prizes left).`;
  return `It has the highest Value Score among ${among}: its big prizes are being claimed more slowly than its small ones.`;
}

export function ProvinceBlock({ p }: { p: ProvincePicks }) {
  const pick = p.picks.overall ?? null;
  const href = (g: PickGame) => `/scratch/${g.province}/${g.slug}`;
  return (
    <div className="home-grid">
      <div className="card home-pick">
        <div className="section-eyebrow">This week&rsquo;s pick · {p.label}</div>
        {pick ? (
          <>
            <h2 className="home-pick-title">
              <Link href={href(pick)}>{pick.name}</Link> <span className="home-price">{money(pick.price)}</span>
            </h2>
            <p className="home-pick-reason">
              {whyFirst(p)} {pickReason(pick)}
            </p>
            <p className="home-pick-note">{PICK_NOTE}</p>
            <ul className="home-bands">
              {(["1-5", "10", "20+"] as const).map((b) => {
                const g = p.picks[b];
                return (
                  <li key={b}>
                    <span className="home-band">{BAND_LABEL[b]}</span>
                    {g ? (
                      <Link href={href(g)}>
                        {g.name} <span className="home-price">{money(g.price)}</span>
                      </Link>
                    ) : (
                      <span className="field-hint">none on sale with a top prize left</span>
                    )}
                  </li>
                );
              })}
            </ul>
            {p.month && p.month.top.length > 0 && (
              <p className="field-hint" style={{ marginTop: 10 }}>
                Steadiest over the last {p.month.days} days (best average daily rank, on sale with a top prize left):{" "}
                {p.month.top.slice(0, 3).map((g, i) => (
                  <span key={g.game_number}>
                    {i > 0 ? ", " : ""}
                    <Link href={href(g)}>{g.name}</Link> ({money(g.price)})
                  </span>
                ))}
                .
              </p>
            )}
            {p.replacements.length > 0 && (
              <p className="field-hint">
                {p.replacements.map((r) => (
                  <span key={`${r.band}-${r.on}`}>
                    Changed {drawDate(r.on)}: {r.old.name} was replaced ({r.reason}).{" "}
                  </span>
                ))}
              </p>
            )}
          </>
        ) : (
          <p className="home-pick-reason">
            No {p.agencyName} scratch ticket on sale has a top prize left right now.
          </p>
        )}
      </div>

      <div className="card home-skip">
        <div className="section-eyebrow">Skip</div>
        {p.skip.length ? (
          <>
            <p className="home-skip-lede">
              <strong>
                {p.skip.length} {p.skip.length === 1 ? "ticket" : "tickets"} still on sale in {p.label}{" "}
                {p.skip.length === 1 ? "has" : "have"} no top prize left.
              </strong>
            </p>
            <ul className="home-skip-list">
              {p.skip.slice(0, 6).map((g) => (
                <li key={g.game_number}>
                  <Link href={href(g)}>{g.name}</Link> <span className="home-price">{money(g.price)}</span>
                  <span className="field-hint"> · top prize {topPrize(g)}: 0 left</span>
                </li>
              ))}
            </ul>
            <p className="field-hint" style={{ marginTop: 8 }}>
          <Link href={`/scratch/${p.province}/prices`}>$20 ticket, four $5 tickets or Lotto Max? Compare by price →</Link>
        </p>
        {p.skip.length > 6 && (
              <Link href={`/scratch/${p.province}`} className="field-hint">
                See all {p.skip.length} →
              </Link>
            )}
          </>
        ) : (
          <p className="home-skip-lede">Every {p.agencyName} scratch ticket on sale still has a top prize left.</p>
        )}
        <p className="field-hint" style={{ marginTop: 10 }}>
          On sale = in {p.agencyName}&rsquo;s current product catalog. Prize counts from {p.agencyName}, as of{" "}
          the latest daily refresh.
        </p>
      </div>

      <div className="card home-new">
        <div className="section-eyebrow">New tickets</div>
        {p.launchDatesKnown === false ? (
          <p className="field-hint">{p.agencyName} doesn&rsquo;t publish launch dates.</p>
        ) : p.newTickets && p.newTickets.length ? (
          <>
            <p className="home-skip-lede">
              Launched in the last five weeks. A new ticket has had the least time for its prizes to be claimed.
            </p>
            <ul className="home-skip-list">
              {p.newTickets.slice(0, 5).map((g) => (
                <li key={g.game_number}>
                  <Link href={href(g)}>{g.name}</Link> <span className="home-price">{money(g.price)}</span>
                  <span className="field-hint"> · launched {drawDate(g.launch_date)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="field-hint">No new {p.agencyName} tickets in the last five weeks.</p>
        )}
        {p.comingSoon && p.comingSoon.length > 0 && (
          <p className="field-hint" style={{ marginTop: 10 }}>
            Coming soon ({p.agencyName} hasn&rsquo;t published dates):{" "}
            {p.comingSoon.map((c) => `${c.name} (${money(c.price)})`).join(", ")}.
          </p>
        )}
      </div>
    </div>
  );
}
