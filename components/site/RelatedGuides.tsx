import Link from "next/link";
import { guidesForGame } from "@/lib/guides";

/**
 * "Guides for <game> players" block — the game -> guide half of the two-way
 * internal linking. Renders nothing when no guide lists this game in its
 * relatedGames frontmatter, so it's safe to drop on every game page.
 */
export function RelatedGuides({ slug, gameName }: { slug: string; gameName: string }) {
  const guides = guidesForGame(slug);
  if (!guides.length) return null;
  return (
    <div className="game-guides">
      <div className="game-guides-title">Guides for {gameName} players</div>
      <div className="guide-card-grid">
        {guides.map((g) => (
          <Link key={g.slug} href={`/guides/${g.slug}`} className="guide-card">
            <span className="guide-card-title">{g.title}</span>
            <span className="guide-card-desc">{g.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
