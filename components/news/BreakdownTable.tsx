import { money } from "@/lib/format";
import type { BreakdownDraw } from "@/lib/breakdowns";

/** Every tier as published: winners and the prize per winning ticket. A tier
 *  the operator marks "NOT WON" (or with no amount) shows that, not a number. */
export function BreakdownTable({ draw }: { draw: BreakdownDraw }) {
  return (
    <div className="table-wrap">
      <table className="prize-table">
        <thead>
          <tr>
            <th>Match</th>
            <th>Winning tickets</th>
            <th>Prize per winning ticket</th>
          </tr>
        </thead>
        <tbody>
          {draw.tiers.map((t) => (
            <tr key={t.code}>
              <td>{t.label}</td>
              <td className="num">{t.winners == null ? "—" : t.winners.toLocaleString("en-CA")}</td>
              <td className="num">
                {t.prize != null && (t.winners ?? 0) > 0
                  ? money(t.prize)
                  : t.prizeLabel
                    ? t.prizeLabel.toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
                    : (t.winners ?? 0) === 0
                      ? "Not won"
                      : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
