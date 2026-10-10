import Link from "next/link";
import { CATEGORY_LABEL, getNews } from "@/lib/news";
import { humanDate } from "@/lib/format";

/** The latest few stories from the news engine (every figure in them is
 *  sourced and verified; see scripts/news_engine.py). */
export function LatestNews({ count = 3 }: { count?: number }) {
  const items = getNews().slice(0, count);
  if (!items.length) return null;
  return (
    <section className="section">
      <div className="container">
        <div className="section-eyebrow">News from the data</div>
        <div className="section-head-row">
          <h2 className="section-headline">
            Latest <em>news.</em>
          </h2>
          <Link href="/news" className="btn btn-secondary">
            All news →
          </Link>
        </div>
        <div className="home-news-grid">
          {items.map((n) => (
            <Link key={n.slug} href={`/news/${n.slug}`} className="game-card">
              <div className="game-card-head">
                <span className="game-card-meta">{CATEGORY_LABEL[n.category]}</span>
                <span className="game-card-meta">{humanDate(n.updated_at)}</span>
              </div>
              <div className="home-news-title">{n.headline}</div>
              <div className="field-hint">{n.dek}</div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
