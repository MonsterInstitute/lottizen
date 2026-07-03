import type { Metadata } from "next";
import Link from "next/link";
import { absUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Responsible Play",
  description:
    "Play scratch tickets for entertainment, not income. Free, confidential support in Ontario — PlaySmart, ConnexOntario, and OLG self-exclusion.",
  alternates: { canonical: "/responsible-play" },
  openGraph: {
    title: "Responsible Play · Lottizen",
    description:
      "Play for entertainment, not income. Free, confidential gambling support in Ontario.",
    url: absUrl("/responsible-play"),
    type: "article",
  },
};

export default function ResponsiblePlayPage() {
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/">Rankings</Link> / <span>Responsible Play</span>
          </div>
          <div className="section-eyebrow">Play smart</div>
          <h1 className="section-headline">
            A ticket is <em>entertainment.</em>
          </h1>
          <p className="section-lede">
            A better Value Score still can&rsquo;t make a lottery a good
            investment. Set a budget, keep it fun, and know where to turn if it
            stops being fun.
          </p>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <div className="prose">
            <h2>The house always keeps an edge</h2>
            <p>
              Ontario instant games return roughly 55–70 cents in prizes for
              every dollar spent, on average, across a full print run. Lottizen
              helps you pick the game with the most value{" "}
              <em>left</em> — but the long-run edge always favours the lottery.
              Never spend money you need, and never chase losses.
            </p>

            <h2>Keep it in check</h2>
            <ul>
              <li>Decide your budget before you buy, and stop there.</li>
              <li>Play with money set aside for fun, never for bills.</li>
              <li>It&rsquo;s a game of chance — no ticket, score, or system changes the odds mid-game.</li>
              <li>Take breaks. If it feels like a chore or a fix, step away.</li>
            </ul>

            <h2>Free, confidential help in Ontario</h2>
            <ul>
              <li>
                <strong>
                  <a href="https://www.playsmart.ca/" target="_blank" rel="noopener noreferrer nofollow">
                    PlaySmart
                  </a>
                </strong>{" "}
                — OLG&rsquo;s responsible-gambling resource, tools, and
                self-assessments.
              </li>
              <li>
                <strong>
                  <a href="https://www.connexontario.ca/" target="_blank" rel="noopener noreferrer nofollow">
                    ConnexOntario
                  </a>
                </strong>{" "}
                — free, confidential support 24/7. Call 1-866-531-2600.
              </li>
              <li>
                <strong>
                  <a
                    href="https://www.olg.ca/en/playsmart/self-exclusion.html"
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    OLG Self-Exclusion
                  </a>
                </strong>{" "}
                — voluntarily exclude yourself from OLG gambling.
              </li>
            </ul>

            <div className="notice" style={{ marginTop: 32 }}>
              <span className="notice-tag">19+</span>
              <span>
                You must be 19 or older to buy lottery tickets in Ontario.
                Lottizen is an independent information tool, not affiliated with
                OLG, and does not sell tickets.
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
