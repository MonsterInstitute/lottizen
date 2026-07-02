import { getRankings } from "@/lib/data";
import { money, score } from "@/lib/format";

/**
 * Marquee ticker (ported). Populated with live top-value picks instead of the
 * old draw-jackpot copy. Content is duplicated so the CSS translateX(-50%)
 * loop is seamless.
 */
export function Ticker() {
  const { games, source } = getRankings();
  const items = games.slice(0, 6).map((g) => (
    <span key={g.slug}>
      <span className="dot" />
      {g.name.toUpperCase()} · ${Math.round(g.price)} · SCORE {score(g.valueScore)}
    </span>
  ));
  const tag = (
    <span>
      <span className="dot" />
      {source === "sample" ? "DEMO DATA" : "LIVE"} · ONTARIO INSTANT GAMES ·{" "}
      {games.length} TRACKED
    </span>
  );
  const track = [...items, tag];
  return (
    <div className="ticker">
      <div className="ticker-track">
        {track}
        {track}
      </div>
    </div>
  );
}
