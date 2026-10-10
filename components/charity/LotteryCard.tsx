import Link from "next/link";
import { KIND_LABEL, daysUntil, fmtDeadline, lotteryPath, nextDeadline, type CharityLottery } from "@/lib/charity";
import { money } from "@/lib/format";
import { Countdown } from "@/components/charity/Countdown";

/** One lottery in a list: what it is, its headline published figure, and
 *  the next deadline. Shows only figures the lottery published. */
export function LotteryCard({ l }: { l: CharityLottery }) {
  const e = l.current;
  const next = e ? nextDeadline(e) : null;
  const status =
    e?.status === "sold_out" ? "Sold out" : e?.status === "upcoming" ? "Not on sale yet" : e?.status === "on_sale" ? "On sale" : null;
  return (
    <Link href={lotteryPath(l)} className="game-card charity-card">
      <div className="game-card-head">
        <span className="game-card-name">{l.name}</span>
        <span className="game-card-meta">{KIND_LABEL[l.kind]}</span>
      </div>
      {l.operator && <div className="field-hint">{l.operator}</div>}
      {e && l.kind !== "home" && e.jackpot != null && e.status === "on_sale" && (
        <div className="charity-figure">
          <span className="lbl">{l.kind === "catch_the_ace" ? "Ace jackpot" : e.guarantee ? "Guaranteed pot" : "Pot now"}</span>
          <span className="amt">{money(e.jackpot)}</span>
        </div>
      )}
      {e && l.kind !== "5050" && e.prizeValue != null && (
        <div className="charity-figure">
          <span className="lbl">{e.prizeCount ? `${e.prizeCount.toLocaleString("en-CA")} prizes worth` : "Prizes worth"}</span>
          <span className="amt">{money(e.prizeValue)}</span>
        </div>
      )}
      {l.kind === "catch_the_ace" && e?.cardsLeft != null && (
        <div className="field-hint">
          {e.cardsLeft} of {e.cardsTotal} cards left
        </div>
      )}
      {e?.ticketCap != null && l.kind !== "5050" && (
        <div className="field-hint">At most {e.ticketCap.toLocaleString("en-CA")} tickets</div>
      )}
      {next ? (
        <div className="game-card-jackpot">
          <span className="lbl">{next.name}</span>
          <span className="amt">
            <Countdown at={next.at} fallback={`${daysUntil(next.at)} day${daysUntil(next.at) === 1 ? "" : "s"}`} />
          </span>
        </div>
      ) : e?.drawDate ? (
        <div className="game-card-jackpot">
          <span className="lbl">{e.status === "drawn" ? "Drawn" : "Draw"}</span>
          <span className="amt">{fmtDeadline(e.drawDate, l.province, false)}</span>
        </div>
      ) : null}
      {status && <div className="field-hint">{status}</div>}
    </Link>
  );
}
