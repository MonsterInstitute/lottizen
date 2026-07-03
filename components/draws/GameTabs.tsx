import Link from "next/link";

const TABS = [
  { key: "", label: "Overview" },
  { key: "results", label: "Results" },
  { key: "statistics", label: "Statistics" },
  { key: "generator", label: "Number Generator" },
  { key: "faq", label: "FAQ" },
];

/** Chip sub-nav shared across a game's pages. `digit` games hide the stat/tool tabs. */
export function GameTabs({
  country,
  slug,
  active,
  hideStats = false,
}: {
  country: string;
  slug: string;
  active: string;
  hideStats?: boolean;
}) {
  const tabs = hideStats
    ? TABS.filter((t) => t.key !== "statistics" && t.key !== "generator")
    : TABS;
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
