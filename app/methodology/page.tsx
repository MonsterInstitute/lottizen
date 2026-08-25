import type { Metadata } from "next";
import Link from "next/link";
import { getAllRankings } from "@/lib/data";
import { PROVINCES } from "@/config/scratch";
import { humanDate } from "@/lib/format";
import { SITE, absUrl } from "@/lib/site";
import { AdSlot } from "@/components/site/AdSlot";
import { JsonLd } from "@/components/site/JsonLd";

export const metadata: Metadata = {
  title: "Methodology — How the Value Score Works",
  description:
    "How Lottizen computes a Value Score for Canadian scratch tickets from each lottery agency's public remaining-prize data — and why Ontario, BC, Quebec, Western Canada, and Atlantic Canada aren't all scored the same way.",
  alternates: { canonical: "/methodology" },
  openGraph: {
    title: "How the Lottizen Value Score Works",
    description:
      "The exact formulas behind our scratch-ticket rankings across all 5 Canadian provinces we track — and the data-source limits behind each one.",
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
        text: "The Value Score compares how much prize money is still unclaimed in a game to how many prizes remain by head-count, using each lottery agency's published printed-vs-unclaimed counts. When the big prizes are draining slower than the overall count, the score rises above its ~62 baseline. Higher means more prize value is still on the table per dollar. Not every agency publishes the same data, so Western Canada and Atlantic Canada use different formulas — see below.",
      },
    },
    {
      "@type": "Question",
      name: "Why aren't all 5 provinces scored the same way?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "OLG, BCLC, and Loto-Québec all publish a printed total AND a remaining count for each prize tier, so those three use the same retention formula. WCLC never publishes printed totals at all, only remaining counts, so it uses a Remaining Value Index instead. ALC only discloses counts for a game's own top prize tier, so it uses a Top Prize Remaining % instead. Each province's board and detail pages say which one applies.",
      },
    },
    {
      "@type": "Question",
      name: "Where does the data come from?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "From each lottery agency's own public instant-game and unclaimed-prize pages: OLG (Ontario), BCLC (British Columbia), WCLC (Alberta/Saskatchewan/Manitoba), ALC (New Brunswick/Nova Scotia/PEI/Newfoundland & Labrador), and Loto-Québec (Quebec). Lottizen re-reads them every morning and recomputes the rankings. Lottizen is independent and not affiliated with any of these agencies.",
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
  const allRankings = getAllRankings();
  const generatedAt = allRankings.map((r) => r.generatedAt).sort().at(-1) ?? new Date().toISOString();
  const anySample = allRankings.some((r) => r.source === "sample");
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
            No luck. No hot-number nonsense. Just each lottery agency&rsquo;s own
            published prize data, run through a transparent formula — though not
            always the <em>same</em> formula. See why below.
          </p>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <div className="prose">
            <p>
              Each agency publishes, for every instant game, some slice of its
              prize tiers — how many of each were <strong>printed</strong> and
              how many are still <strong>unclaimed</strong>. That&rsquo;s the raw
              material. The Value Score reads it every morning and asks one
              question: <em>are the big prizes disproportionately still out
              there?</em>
            </p>

            <p>
              Not every agency discloses the same slice, though — so Lottizen
              uses <strong>three different formulas</strong> depending on what a
              given province actually publishes, and labels which one applies on
              every ranking page. See{" "}
              <a href="#scoring-methods">the three methods</a> below for the full
              breakdown.
            </p>

            <h2 id="scoring-methods">Three scoring methods</h2>
            <p>
              A province&rsquo;s data-completeness badge (shown on its ranking
              board) tells you which of these applies before you even open a
              ticket:
            </p>

            <h3>1 · Retention — Ontario, British Columbia, Quebec (&ldquo;Full tier data&rdquo;)</h3>
            <p>
              OLG, BCLC, and Loto-Québec all publish a real <strong>printed
              total</strong> and a real <strong>remaining count</strong> for
              every valued prize tier. This is the richest data, so it gets the
              full retention formula — see the step-by-step walkthrough below.
            </p>

            <h3>2 · Remaining Value Index — Western Canada / WCLC (&ldquo;Remaining counts only&rdquo;)</h3>
            <p>
              WCLC (covering Alberta, Saskatchewan, and Manitoba) never
              publishes how many prizes a ticket printed with — only how many
              of each tier (≥$100) are still unclaimed <em>today</em>.
              Retention is mathematically impossible without a printed total,
              so Western Canada instead uses:
            </p>
            <div className="formula">
              Remaining Value Index = Σ (remaining × amount) ÷ price
            </div>
            <p>
              — the dollar value of remaining prizes, disclosed tiers only, per
              dollar of ticket price. This is a <strong>raw CAD figure, not a
              0-100ish score</strong>, and it is <strong>not comparable</strong>{" "}
              to Ontario/BC/Quebec&rsquo;s retention scores or to Atlantic
              Canada&rsquo;s top-prize percentage — only to other Western Canada
              games.
            </p>

            <h3>3 · Top Prize Remaining % — Atlantic Canada / ALC (&ldquo;Top prizes only&rdquo;)</h3>
            <p>
              ALC (covering New Brunswick, Nova Scotia, PEI, and Newfoundland
              &amp; Labrador) publishes a real printed total and remaining count
              — but only for a game&rsquo;s own headline top prize tier(s), never
              any lower tier. So Atlantic Canada&rsquo;s score is simply:
            </p>
            <div className="formula">Top Prize Remaining % = Σ remaining ÷ Σ total × 100</div>
            <p>
              — summed over the top tier(s) only. It happens to land on a
              similar 0-100 scale to the retention score by coincidence of
              units, but it is measuring something different (one tier, not the
              whole game) and isn&rsquo;t directly comparable either.
            </p>

            <h3>Data-source limits — and what we&rsquo;re still digging for</h3>
            <p>
              WCLC and ALC&rsquo;s narrower formulas above reflect what their
              public feeds actually contain today, not a shortcut we chose.
              Lottizen has looked (and keeps looking) for any regulatory
              disclosure, annual-report appendix, or provincial gaming-commission
              filing where either agency might publish fuller printed-total data
              — if one turns up, these two provinces will move to the full
              retention formula. Until then, this is the honest ceiling of what
              can be measured from public data.
            </p>
            <p>
              Loto-Québec is a special case worth naming: its printed totals are
              published on a live &ldquo;état de réclamation des lots&rdquo; page
              (paired total + claimed columns per tier), which Lottizen uses as
              Quebec&rsquo;s sole source. During this build we specifically looked
              for a separate downloadable PDF re-publishing the same per-game
              totals — to cross-check for drift — and could not locate one
              distinct from the live page; the one prize-related PDF discoverable
              from Loto-Québec&rsquo;s own rules page turned out to be a generic
              draw-game formula table, unrelated to scratch tickets. If a genuine
              second source surfaces, reconciling it is a candidate follow-up.
            </p>

            <h2>Retention, step by step (Ontario / BC / Quebec)</h2>

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
              The <code>0.62</code> is a rough instant-game return-to-player,
              used only so a baseline game reads about <strong>62</strong> —
              roughly &ldquo;cents of prize value left per dollar.&rdquo; It&rsquo;s
              a fixed multiplier, so it never changes the <em>order</em> of the
              ranking within a province; that&rsquo;s driven entirely by the
              agency&rsquo;s own counts. We list every game highest score first.
            </p>

            <h2>What the score is — and isn&rsquo;t</h2>
            <ul>
              <li>
                <strong>It is</strong> a like-for-like way to compare which games
                still have the most prize value left today, straight from each
                agency&rsquo;s own numbers — within one province and scoring
                method.
              </li>
              <li>
                <strong>It isn&rsquo;t</strong> a prediction, a system, or a way
                to beat the odds. The house edge is baked in and unchanged.
              </li>
              <li>
                <strong>It works from disclosed prize tiers.</strong> Each
                agency&rsquo;s feed lists a game&rsquo;s notable prizes, not every
                $2 win (and for WCLC/ALC, only a subset of tiers at all), so the
                score reflects the prizes worth chasing. Treat close scores as
                ties.
              </li>
              <li>
                <strong>It isn&rsquo;t comparable across scoring methods.</strong>{" "}
                Ontario/BC/Quebec&rsquo;s retention scores, Western Canada&rsquo;s
                Remaining Value Index, and Atlantic Canada&rsquo;s Top Prize
                Remaining % are three different measurements — only compare
                games within the same province.
              </li>
            </ul>

            <h2>Freshness</h2>
            <p>
              Rankings for all 5 provinces are rebuilt every morning from each
              agency&rsquo;s public data, on independent schedules per agency (so
              one agency&rsquo;s outage never delays another&rsquo;s). This
              page&rsquo;s data was generated <strong>{humanDate(generatedAt)}</strong>
              {anySample ? " (at least one province is still on a demo dataset)" : ""}.
              Prizes can be claimed at any time — always confirm the current
              numbers with the official lottery operator (OLG, BCLC, WCLC, ALC,
              or Loto-Québec) before you buy.
            </p>

            <div className="notice" style={{ marginTop: 32 }}>
              <span className="notice-tag">19+</span>
              <span>
                Lottizen is an independent information tool and is not affiliated
                with or endorsed by OLG, BCLC, WCLC, ALC, or Loto-Québec. Play for
                entertainment only. If gambling
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
