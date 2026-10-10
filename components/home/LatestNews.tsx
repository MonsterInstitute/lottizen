import Link from "next/link";
import { CATEGORY_LABEL, getNews, type NewsItem } from "@/lib/news";
import { humanDate } from "@/lib/format";
import { HOME_REGIONS } from "@/components/home/regions";

const WCLC = ["alberta", "saskatchewan", "manitoba", "territories"];
const CANADA = HOME_REGIONS.map((r) => r.key).filter((k) => k !== "usa" && k !== "europe");
// Agency markers in a story's slug (the news engine names the agency there).
const AGENCY_REGIONS: [RegExp, string[]][] = [
  [/(^|-)(olg|ontario)(-|$)/, ["ontario"]],
  [/(^|-)(loto-quebec|quebec)(-|$)/, ["quebec"]],
  [/(^|-)(bclc|british-columbia)(-|$)/, ["british-columbia"]],
  [/(^|-)(wclc|western)(-|$)/, WCLC],
  [/(^|-)(alc|atlantic)(-|$)/, ["atlantic"]],
  [/(^|-)(nova-scotia|new-brunswick|prince-edward-island|newfoundland|qeii|nb-hospital)(-|$)/, ["atlantic"]],
  [/(^|-)(alberta|calgary|edmonton|oilers|flames|elks|stampeders|mighty-millions|red-deer|stars-lottery-alberta)(-|$)/, ["alberta"]],
  [/(^|-)(saskatchewan|saskatoon|regina|roughriders?|riders)(-|$)/, ["saskatchewan"]],
  [/(^|-)(manitoba|jets|blue-bombers|hsc|winnipeg)(-|$)/, ["manitoba"]],
  [/(^|-)(canucks|bc-lions|vgh|whitecaps|pne|bc-childrens)(-|$)/, ["british-columbia"]],
  [/(^|-)(leafs|maple-leafs|raptors|jays|tfc|argonauts|redblacks|senators|princess-margaret|sickkids|cheo|london-dream)(-|$)/, ["ontario"]],
  [/(^|-)(canadiens|alouettes|cf-montreal|enfant-soleil)(-|$)/, ["quebec"]],
];

/** Which regions a story is about: its agency's, or every Canadian region
 *  for a national game story with no agency in it. */
function regionsOf(n: NewsItem): string[] {
  for (const [re, regions] of AGENCY_REGIONS) if (re.test(n.slug)) return regions;
  return CANADA;
}

/** The latest stories from the news engine (every figure sourced and
 *  verified; see scripts/news_engine.py), only those about the visitor's
 *  region: each card lists the regions it's among the latest `count` for
 *  (data-regions), and the browser hides the rest. */
export function LatestNews({ count = 3 }: { count?: number }) {
  const items = getNews();
  const shownFor = new Map<string, string[]>();
  for (const region of CANADA) {
    items
      .filter((n) => regionsOf(n).includes(region))
      .slice(0, count)
      .forEach((n) => shownFor.set(n.slug, [...(shownFor.get(n.slug) ?? []), region]));
  }
  const cards = items.filter((n) => shownFor.has(n.slug));
  if (!cards.length) return null;
  const covered = CANADA.filter((r) => cards.some((n) => shownFor.get(n.slug)!.includes(r)));
  return (
    <section className="section" data-country-scope="CA" data-regions={covered.join(" ")}>
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
          {cards.map((n) => (
            <Link key={n.slug} href={`/news/${n.slug}`} className="game-card" data-regions={shownFor.get(n.slug)!.join(" ")}>
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
