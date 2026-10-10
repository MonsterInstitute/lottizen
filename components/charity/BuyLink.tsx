import { provinceByCode, type CharityLottery } from "@/lib/charity";

/**
 * The official purchase link, shown only to a visitor whose province is
 * known and is one the lottery is licensed in (data-home-prov, set by
 * RegionScript; CSS in globals.css). Everyone else, crawlers included, gets
 * the note instead: only people physically in the licensing province can
 * buy, and lotteries may not be marketed to anyone outside it (AGCO Raffle
 * Licence Terms §5.3; AGLC and BC rules are the same).
 *
 * The link goes straight to the lottery's own site, with no tracking
 * parameters and nothing paid per ticket sold (AGCO Electronic Raffle
 * Operational Terms s.3.2).
 */
export function BuyLink({ l, label = "Buy on the official site" }: { l: CharityLottery; label?: string }) {
  const codes = l.provinces?.length ? l.provinces : [l.province];
  const where = codes.map((c) => provinceByCode(c)?.name ?? c);
  const names = where.length > 1 ? `${where.slice(0, -1).join(", ")} or ${where.at(-1)}` : where[0];
  if (!l.buyUrl) return null;
  return (
    <>
      <a className="btn btn-primary buy-link" data-prov={codes.join(" ")} href={l.buyUrl} target="_blank" rel="nofollow noopener noreferrer">
        {label} →
      </a>
      <span className="buy-elsewhere field-hint" data-prov={codes.join(" ")}>
        Only people in {names} can buy tickets for this lottery, from its own site.
      </span>
    </>
  );
}
