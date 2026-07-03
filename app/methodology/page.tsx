import type { Metadata } from "next";
import Link from "next/link";
import { getRankings } from "@/lib/data";
import { humanDate } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { AdSlot } from "@/components/site/AdSlot";
import { JsonLd } from "@/components/site/JsonLd";

export const metadata: Metadata = {
  title: "Methodology — How the Value Score Works",
  description:
    "How Lottizen computes a Value Score for Ontario scratch tickets from OLG's public remaining-prize data: estimated tickets left, remaining prize pool, and expected value per dollar.",
  alternates: { canonical: "/methodology" },
  openGraph: {
    title: "How the Lottizen Value Score Works",
    description:
      "The exact formula behind our Ontario scratch-ticket rankings — estimated remaining tickets, remaining prize pool, and expected value per dollar.",
    url: absUrl("/methodology"),
    type: "article",
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is a scratch ticket Value Score?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The Value Score compares how much prize money is still unclaimed in a game to how many prizes remain by head-count, using OLG's published printed-vs-unclaimed counts. When the big prizes are draining slower than the overall count, the score rises above its ~62 baseline. Higher means more prize value is still on the table per dollar.",
      },
    },
    {
      "@type": "Question",
      name: "Where does the data come from?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "From OLG's public instant-game and unclaimed-prize pages. Lottizen re-reads them every morning and recomputes the rankings. Lottizen is independent and not affiliated with OLG.",
      },
    },
    {
      "@type": "Question",
      name: "Does a high Value Score improve my odds of winning?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Every ticket is still a game of chance and the house edge is unchanged. A higher score only means the remaining tickets hold more expected prize value than a lower-scoring game. Play for entertainment only.",
      },
    },
  ],
};

export default function MethodologyPage() {
  const { generatedAt, source } = getRankings();
  return (
    <>
      <JsonLd data={faqJsonLd} />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/scratch">Scratch</Link> / <span>Methodology</span>
          </div>
          <div className="section-eyebrow">Methodology</div>
          <h1 className="section-headline">
            How we score <em>value.</em>
          </h1>
          <p className="section-lede">
            No luck. No hot-number nonsense. Just OLG&rsquo;s own published prize
            data, run through one transparent formula.
          </p>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <div className="prose">
            <p>
              OLG publishes, for every instant game, its top prize tiers — how
              many of each were <strong>printed</strong> and how many are still{" "}
              <strong>unclaimed</strong>. That&rsquo;s the raw material. The Value
              Score reads it every morning and asks one question:{" "}
              <em>are the big prizes disproportionately still out there?</em>
            </p>

            <h2>The idea in one line</h2>
            <p>
              Compare how much prize <strong>money</strong> is left to how many
              prizes by <strong>head-count</strong> are left. If the dollars are
              draining slower than the count, the game&rsquo;s remaining tickets
              are unusually rich — a buy signal.
            </p>

            <h2>The steps</h2>

            <h3>1 · Add up prizes, two ways</h3>
            <p>Across a game&rsquo;s valued prize tiers:</p>
            <div className="formula">
              printed_pool&nbsp;&nbsp;= Σ (total&nbsp;&nbsp;&nbsp;× amount)
              <br />
              remaining_pool = Σ (remaining × amount)
              <br />
              count_total&nbsp;&nbsp;&nbsp;= Σ total
              <br />
              count_remaining = Σ remaining
            </div>

            <h3>2 · Two fractions left</h3>
            <div className="formula">
              g = remaining_pool ÷ printed_pool&nbsp;&nbsp;(share of prize $ left)
              <br />
              f = count_remaining ÷ count_total&nbsp;&nbsp;(share of prizes left)
            </div>
            <p>
              <code>f</code> is the &ldquo;remaining prize ratio&rdquo; — a proxy
              for how much of the print run is still unsold. <code>g</code>{" "}
              weights that by <em>dollars</em>.
            </p>

            <h3>3 · Retention = value vs count</h3>
            <div className="formula">retention = g ÷ f</div>
            <ul>
              <li>
                <strong>retention &gt; 1</strong> — big prizes are still
                disproportionately unclaimed. Better value.
              </li>
              <li>
                <strong>retention = 1</strong> — prizes draining evenly with
                sales. Baseline.
              </li>
              <li>
                <strong>retention &lt; 1</strong> — jackpots mostly gone, small
                prizes left. Worse value.
              </li>
            </ul>

            <h3>4 · Scale to a familiar number</h3>
            <div className="formula">
              <strong>Value Score = 0.62 × retention × 100</strong>
            </div>
            <p>
              The <code>0.62</code> is the rough Ontario instant-game
              return-to-player, used only so a baseline game reads about{" "}
              <strong>62</strong> — roughly &ldquo;cents of prize value left per
              dollar.&rdquo; It&rsquo;s a fixed multiplier, so it never changes
              the <em>order</em> of the ranking; that&rsquo;s driven entirely by
              OLG&rsquo;s own counts. We list every game highest score first.
            </p>

            <h2>What the score is — and isn&rsquo;t</h2>
            <ul>
              <li>
                <strong>It is</strong> a like-for-like way to compare which games
                still have the most prize value left today, straight from
                OLG&rsquo;s numbers.
              </li>
              <li>
                <strong>It isn&rsquo;t</strong> a prediction, a system, or a way
                to beat the odds. The house edge is baked in and unchanged.
              </li>
              <li>
                <strong>It works from top-prize tiers.</strong> OLG&rsquo;s feed
                lists a game&rsquo;s notable prizes, not every $2 win, so the
                score reflects the prizes worth chasing. Treat close scores as
                ties.
              </li>
            </ul>

            <h2>Freshness</h2>
            <p>
              The rankings are rebuilt every morning at 6:00 AM Eastern from
              OLG&rsquo;s public data. This page&rsquo;s data was generated{" "}
              <strong>{humanDate(generatedAt)}</strong>
              {source === "sample" ? " (demo dataset)" : ""}. Prizes can be
              claimed at any time — always confirm the current numbers on{" "}
              <a
                href="https://www.olg.ca/en/winners/unclaimed-instant-prizes.html"
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                olg.ca
              </a>{" "}
              before you buy.
            </p>

            <div className="notice" style={{ marginTop: 32 }}>
              <span className="notice-tag">19+</span>
              <span>
                Lottizen is an independent information tool and is not affiliated
                with or endorsed by OLG. Play for entertainment only. If gambling
                stops being fun, help is free and confidential —{" "}
                <Link href="/responsible-play">see resources</Link>.
              </span>
            </div>
          </div>

          <div style={{ height: 48 }} />
          <AdSlot slot="methodology-foot" format="leaderboard" />
        </div>
      </section>
    </>
  );
}
