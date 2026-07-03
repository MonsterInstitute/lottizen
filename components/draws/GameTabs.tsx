import Link from "next/link";
import { getGame } from "@/config/games";

const TABS = [
  { key: "", label: "Overview" },
  { key: "results", label: "Results" },
  { key: "statistics", label: "Statistics" },
  { key: "generator", label: "Number Generator" },
  { key: "faq", label: "FAQ" },
];

/** Chip sub-nav shared across a game's pages. Positional-digit games have no
 *  number generator, so that tab is hidden for them. */
export function GameTabs({
  country,
  slug,
  active,
  format,
}: {
  country: string;
  slug: string;
  active: string;
  format?: string;
}) {
  const fmt = format ?? getGame(slug)?.format;
  const tabs = fmt === "digit" ? TABS.filter((t) => t.key !== "generator") : TABS;
  return (
    <div className="chip-row" style={{ marginTop: 24 }}>
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`/${country}/${slug}${t.key ? `/${t.key}` : ""}`}
          className={`chip ${active === t.key ? "active" : ""}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
