import Link from "next/link";

const TABS = [
  { key: "", label: "Overview" },
  { key: "results", label: "Results" },
  { key: "statistics", label: "Statistics" },
  { key: "generator", label: "Number Generator" },
  { key: "faq", label: "FAQ" },
];

/** Chip-style sub-navigation shared across a game's pages. */
export function GameTabs({ slug, active }: { slug: string; active: string }) {
  return (
    <div className="chip-row" style={{ marginTop: 24 }}>
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/canada/${slug}${t.key ? `/${t.key}` : ""}`}
          className={`chip ${active === t.key ? "active" : ""}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
