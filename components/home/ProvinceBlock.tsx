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

const href = (g: PickGame) => `/scratch/${g.province}/${g.slug}`; // g.province = the scratch board slug

/** Every card below renders only when it has something to show — no empty
 *  boxes explaining why (data limits live on /methodology). `full` is the
 *  /picks version: every band, the whole skip list, all new tickets. */
export function PickCard({ p, full = false }: { p: ProvincePicks; full?: boolean }) {
  const pick = p.picks.overall ?? null;
  if (!pick) return null;
  const bands = (["1-5", "10", "20+"] as const).filter((b) => p.picks[b]);
  return (
    <div className="card home-pick">
      <div className="section-eyebrow">This week&rsquo;s pick · {p.label}</div>
      <h3 className="home-pick-title">
        <Link href={href(pick)}>{pick.name}</Link> <span className="home-price">{money(pick.price)}</span>
      </h3>
      <p className="home-pick-reason">
        {whyFirst(p)} {pickReason(pick)}
      </p>
      <p className="home-pick-note">{PICK_NOTE}</p>
      {bands.length > 0 && (
        <ul className="home-bands">
          {bands.map((b) => {
            const g = p.picks[b]!;
            return (
              <li key={b}>
                <span className="home-band">{BAND_LABEL[b]}</span>
                <Link href={href(g)}>
                  {g.name} <span className="home-price">{money(g.price)}</span>
                </Link>
                {full && <span className="field-hint"> · {pickReason(g)}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {full && p.month && p.month.top.length > 0 && (
        <>
          <h4 className="home-sub">This month</h4>
          <p className="field-hint" style={{ margin: "0 0 6px" }}>
            Best average daily rank over the last {p.month.days} days, among tickets on sale with a top prize left.
          </p>
          <ol className="home-skip-list">
            {p.month.top.map((g) => (
              <li key={g.game_number}>
                <Link href={href(g)}>{g.name}</Link> <span className="home-price">{money(g.price)}</span>
                <span className="field-hint"> · average rank {g.avg_rank}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {!full && p.month && p.month.top.length > 0 && (
        <p className="field-hint" style={{ marginTop: 10 }}>
          Steadiest over the last {p.month.days} days:{" "}
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
    </div>
  );
}

export function SkipCard({ p, full = false }: { p: ProvincePicks; full?: boolean }) {
  if (!p.skip.length) return null;
  const shown = full ? p.skip : p.skip.slice(0, 6);
  return (
    <div className="card home-skip">
      <div className="section-eyebrow">Skip these</div>
      <p className="home-skip-lede">
        <strong>
          {p.skip.length} {p.skip.length === 1 ? "ticket" : "tickets"} still on sale in {p.label}{" "}
          {p.skip.length === 1 ? "has" : "have"} no top prize left.
        </strong>
      </p>
      <ul className="home-skip-list">
        {shown.map((g) => (
          <li key={g.game_number}>
            <Link href={href(g)}>{g.name}</Link> <span className="home-price">{money(g.price)}</span>
            <span className="field-hint"> · top prize {topPrize(g)}: 0 left</span>
          </li>
        ))}
      </ul>
      {!full && p.skip.length > shown.length && (
        <p className="field-hint" style={{ marginTop: 8 }}>
          <Link href={`/picks#${p.province}`}>See all {p.skip.length} →</Link>
        </p>
      )}
      <p className="field-hint" style={{ marginTop: 8 }}>
        <Link href={`/scratch/${p.scratchSlug}/prices`}>$20 ticket, four $5 tickets or Lotto Max? Compare by price →</Link>
      </p>
    </div>
  );
}

export function NewTicketsCard({ p, full = false }: { p: ProvincePicks; full?: boolean }) {
  const fresh = p.newTickets ?? [];
  const coming = p.comingSoon ?? [];
  if (!fresh.length && !coming.length) return null;
  return (
    <div className="card home-new">
      <div className="section-eyebrow">New tickets · {p.label}</div>
      {fresh.length > 0 && (
        <>
          <p className="home-skip-lede">
            Launched in the last five weeks. A new ticket has had the least time for its prizes to be claimed.
          </p>
          <ul className="home-skip-list">
            {(full ? fresh : fresh.slice(0, 5)).map((g) => (
              <li key={g.game_number}>
                <Link href={href(g)}>{g.name}</Link> <span className="home-price">{money(g.price)}</span>
                <span className="field-hint"> · launched {drawDate(g.launch_date)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {coming.length > 0 && (
        <p className="field-hint" style={{ marginTop: 10 }}>
          Coming soon: {coming.map((c) => `${c.name} (${money(c.price)})`).join(", ")}.
        </p>
      )}
    </div>
  );
}

export function hasWeek(p: ProvincePicks): boolean {
  return !!p.picks.overall || p.skip.length > 0;
}

export function hasNew(p: ProvincePicks): boolean {
  return (p.newTickets?.length ?? 0) > 0 || (p.comingSoon?.length ?? 0) > 0;
}
