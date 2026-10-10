import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";
import { getPicks } from "@/lib/picks";
import { JsonLd } from "@/components/site/JsonLd";
import { AdSlot } from "@/components/site/AdSlot";
import { HOME_REGIONS } from "@/components/home/regions";
import { RegionScript } from "@/components/home/RegionScript";
import { RegionPicker } from "@/components/home/RegionPicker";
import { ProvinceBlock } from "@/components/home/ProvinceBlock";
import { DrawsList } from "@/components/home/DrawsList";
import { MyTicketsCard } from "@/components/home/MyTicketsCard";

export const metadata: Metadata = {
  title: { absolute: `${SITE.name} — This week's scratch pick, what to skip, and the next draws` },
  description:
    "For your province: this week's scratch ticket with the most prize money left, the tickets still on sale with no top prize left, and the next lottery draws. US and European results too. Free, from the agencies' published data.",
  alternates: { canonical: "/" },
};

const NATIONAL = ["lotto-max", "lotto-6-49", "daily-grand"];
// Regional draw games Lottizen has data for, by agency. Quebec's and Atlantic
// Canada's regional games aren't tracked, so those blocks show national games.
const REGIONAL: Record<string, string[]> = {
  ontario: ["ontario-49", "lottario", "megadice"],
  "british-columbia": ["bc-49"],
  western: ["western-max", "western-6-49"],
  quebec: [],
  atlantic: [],
};

export default function HomePage() {
  const picks = getPicks();
  return (
    <>
      <RegionScript />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebSite", name: SITE.name, url: SITE.url, description: SITE.description }} />

      <section className="home-head">
        <div className="container">
          <h1 className="section-headline home-h1">
            This week: what to buy, <em>what to skip,</em> and what&rsquo;s drawing next.
          </h1>
          <p className="section-lede">
            From the lottery agencies&rsquo; own published prize data, refreshed daily. Pick your region:
          </p>
          <RegionPicker />
        </div>
      </section>

      <div className="container home-regions">
        {HOME_REGIONS.map((r) => {
          if (r.key === "usa" || r.key === "europe") {
            const slugs =
              r.key === "usa"
                ? ["powerball", "mega-millions", "new-york-lotto", "take-5", "pick-10"]
                : ["euromillions", "eurojackpot", "uk-lotto"];
            return (
              <section key={r.key} data-region-block={r.key} className="home-region" aria-label={r.label}>
                <h2 className="home-region-title">{r.label}</h2>
                <p className="field-hint">
                  Lottizen has no scratch-ticket data outside Canada, so here are the latest results and the next draws.
                </p>
                <DrawsList slugs={slugs} title="Next draws and latest numbers" />
                <p>
                  <Link href={r.key === "usa" ? "/usa" : "/europe"}>All {r.key === "usa" ? "US" : "European"} results →</Link>
                </p>
              </section>
            );
          }
          const p = picks.provinces[r.key];
          return (
            <section key={r.key} data-region-block={r.key} className="home-region" aria-label={r.label}>
              <h2 className="home-region-title">{r.label}</h2>
              {p ? <ProvinceBlock p={p} /> : null}
              <div className="home-grid">
                <DrawsList slugs={[...NATIONAL, ...REGIONAL[r.key]]} title="Next draws and latest numbers" />
                <MyTicketsCard />
              </div>
              <p className="home-more">
                <Link href={`/scratch/${r.key}`}>Every {r.label} scratch ticket, ranked →</Link>
              </p>
            </section>
          );
        })}
      </div>

      <section className="container">
        <AdSlot slot="home-mid" format="leaderboard" />
      </section>

      <section className="section">
        <div className="container home-secondary">
          <div className="section-eyebrow">More</div>
          <ul>
            <li><Link href="/canada">Canadian results</Link></li>
            <li><Link href="/usa">US results</Link></li>
            <li><Link href="/europe">European results</Link></li>
            <li><Link href="/statistics">Number statistics</Link></li>
            <li><Link href="/generator">Number tools</Link></li>
            <li><Link href="/guides">Guides</Link></li>
            <li><Link href="/subscribe">Weekly email</Link></li>
          </ul>
        </div>
      </section>
    </>
  );
}
