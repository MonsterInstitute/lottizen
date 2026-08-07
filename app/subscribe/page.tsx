import type { Metadata } from "next";
import { SITE, absUrl } from "@/lib/site";
import { SubscribeForm } from "@/components/site/SubscribeForm";
import { SubscribeErrorBanner } from "@/components/site/SubscribeErrorBanner";
import { JsonLd } from "@/components/site/JsonLd";

export const metadata: Metadata = {
  title: "Free Lottery Email Alerts — Winning Numbers & Weekly Digest",
  description:
    "Get an email the moment your lottery games draw — winning numbers, jackpot updates, a data insight, and an automatic check of your saved numbers. Plus a Sunday weekly digest. Free, no account needed.",
  alternates: { canonical: "/subscribe" },
  openGraph: {
    title: "Free Lottery Email Alerts",
    description: "Winning numbers by email the moment they draw, plus a Sunday weekly digest. Free.",
    url: absUrl("/subscribe"),
    type: "website",
  },
};

export default function SubscribePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Lottizen email alerts",
    description: metadata.description,
    url: absUrl("/subscribe"),
    isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <span>Subscribe</span>
          </div>
          <div className="section-eyebrow">Free newsletter</div>
          <h1 className="section-headline">
            Winning numbers, <em>in your inbox.</em>
          </h1>
          <p className="section-lede">
            Follow the lottery games you play. We&rsquo;ll email you the moment they draw — with a
            data insight and, if you save your numbers, an automatic check. No account, no
            password, unsubscribe with one click.
          </p>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container" style={{ maxWidth: 640 }}>
          <SubscribeErrorBanner />

          <div className="card" style={{ padding: 32 }}>
            <SubscribeForm title="Email address" />
          </div>

          <div style={{ marginTop: 48 }}>
            <h2 className="section-headline" style={{ fontSize: "clamp(24px,3vw,32px)", marginBottom: 16 }}>
              What you&rsquo;ll get
            </h2>
            <div className="prose">
              <ul>
                <li>
                  <strong>Instant draw results.</strong> The moment a game you follow draws, get the
                  winning numbers, whether anyone won the jackpot, and the next draw date — laid out
                  the same way as the site.
                </li>
                <li>
                  <strong>A real data insight, every time.</strong> Not filler — something like a
                  number&rsquo;s current gap versus its historical record, or where this draw&rsquo;s
                  sum falls in the distribution.
                </li>
                <li>
                  <strong>Automatic number checking.</strong> Save one number combination and every
                  email tells you how many matched — including a near-miss note when you were one
                  number away from a prize tier.
                </li>
                <li>
                  <strong>A Sunday digest</strong> summarizing the week&rsquo;s results across your
                  followed games, jackpot trends, and one relevant guide.
                </li>
                <li>
                  <strong>Ontario scratch tickets</strong> — Canadian subscribers also get today&rsquo;s
                  top 3 best-value scratch tickets in every instant email.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
