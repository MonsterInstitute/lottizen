import Link from "next/link";
import { siblingGames } from "@/lib/draws";

/** Quick horizontal switch to sibling games (same region + national) for the
 *  current statistics/generator page. */
export function GameSwitcher({
  slug,
  kind,
}: {
  slug: string;
  kind: "statistics" | "generator";
}) {
  const siblings = siblingGames(slug, kind);
  if (!siblings.length) return null;
  return (
    <div style={{ marginTop: 20 }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          marginRight: 4,
        }}
      >
        Switch:
      </span>
      <span className="chip-row" style={{ display: "inline-flex", verticalAlign: "middle" }}>
        {siblings.map((s) => (
          <Link key={s.slug} href={s.href} className="chip">
            {s.name}
          </Link>
        ))}
        <Link href={`/${kind === "statistics" ? "statistics" : "generator"}`} className="chip">
          All →
        </Link>
      </span>
    </div>
  );
}
