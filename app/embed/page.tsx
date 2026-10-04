import type { Metadata } from "next";
import Link from "next/link";
import { COUNTRIES } from "@/config/games";
import { embedCatalog } from "@/lib/embed";
import { SITE, absUrl } from "@/lib/site";
import { EmbedBuilder } from "@/components/site/EmbedBuilder";

export const metadata: Metadata = {
  title: "Free Lottery Widgets — Embed Results, Jackpots & Scratch Rankings",
  description:
    "Free lottery widgets for your site: latest winning numbers, current jackpots, number statistics, and the top 3 scratch tickets by prize money left in each Canadian province. One copy-paste iframe, no JavaScript, updated daily.",
  alternates: { canonical: "/embed" },
  openGraph: {
    title: "Free Lottery Widgets from Lottizen",
    description:
      "Embed latest numbers, jackpots, number statistics or Canadian scratch-ticket rankings on your site. Free, no JavaScript, updated daily.",
    url: absUrl("/embed"),
    type: "website",
  },
};

export default function EmbedPage() {
  const catalog = embedCatalog(COUNTRIES);
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/">Home</Link> / <span>Widgets</span>
          </div>
          <div className="section-eyebrow">Free widgets</div>
          <h1 className="section-headline">
            Put live lottery data <em>on your site.</em>
          </h1>
          <p className="section-lede">
            Latest numbers, jackpots, number history and Canadian scratch-ticket rankings, as a small widget you
            paste into any page. Free, no sign-up, no JavaScript, refreshed every day.
          </p>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <EmbedBuilder catalog={catalog} siteUrl={SITE.url} />
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container prose">
          <h2>How it works</h2>
          <ul>
            <li>
              Each widget is one HTML page served in an iframe, with no scripts, cookies or tracking. It
              won&rsquo;t slow your page down, and it&rsquo;s cached close to your readers.
            </li>
            <li>
              The data is the same we publish on Lottizen, read from each lottery operator&rsquo;s own results and
              prize tables every morning. Widgets update on their own.
            </li>
            <li>
              Keep the credit line under the iframe. It&rsquo;s how readers find the full results and how we keep
              this free.
            </li>
            <li>
              Scratch rankings describe prize money still unclaimed, not the odds of winning; see the{" "}
              <Link href="/methodology">methodology</Link>. Number widgets show past results only: every number has
              the same chance in every draw.
            </li>
          </ul>
          <p>
            Need something else, like a different size, another game, or raw data? Use the{" "}
            <Link href="/api">Lottizen API</Link> or write to{" "}
            <a href={`mailto:${SITE.pressEmail}`}>{SITE.pressEmail}</a>.
          </p>
        </div>
      </section>
    </>
  );
}
