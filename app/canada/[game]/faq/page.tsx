import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLiveGame } from "@/config/games";
import { getPlayableSlugs } from "@/lib/draws";
import { absUrl } from "@/lib/site";
import { GameTabs } from "@/components/draws/GameTabs";
import { JsonLd } from "@/components/site/JsonLd";

export const dynamicParams = false;
export function generateStaticParams() {
  return getPlayableSlugs().map((game) => ({ game }));
}

function faqs(name: string, agency: string, days: string[]) {
  const anon =
    agency === "OLG"
      ? "No. In Ontario, OLG publishes the name and municipality of prize winners — you cannot claim a major prize anonymously."
      : "Rules vary by province. Most Canadian lottery corporations publish winners' names; a few allow limited anonymity for certain prize levels. Check your provincial corporation's rules.";
  return [
    {
      q: `When is the ${name} cut-off?`,
      a: `Ticket sales for a ${name} draw close before the draw on ${days.join(" and ")} evening (typically around 10:30 PM ET). Buy before the cut-off to be entered for that night's draw.`,
    },
    {
      q: `How long do I have to claim a ${name} prize?`,
      a: `In most Canadian provinces you have 12 months from the draw date to claim a prize. Confirm the exact deadline and claim process with ${agency}.`,
    },
    {
      q: `Are ${name} winnings taxed in Canada?`,
      a: `No. Lottery winnings are tax-free in Canada — you keep 100% of the prize. Any income later earned from investing the winnings can be taxable.`,
    },
    {
      q: `Can I stay anonymous if I win ${name}?`,
      a: anon,
    },
    {
      q: `Does Lottizen sell ${name} tickets?`,
      a: `No. Lottizen is an independent information site — we track winning numbers and statistics only. Buy tickets from ${agency} or an authorized retailer.`,
    },
  ];
}

export function generateMetadata({ params }: { params: { game: string } }): Metadata {
  const g = getLiveGame(params.game);
  if (!g) return {};
  const title = `${g.name} FAQ — Cut-off, Claim Deadline, Taxes`;
  const description = `${g.name} FAQ: ticket cut-off times, prize claim deadlines, whether winnings are taxed in Canada, and winner anonymity rules.`;
  return {
    title,
    description,
    alternates: { canonical: `/canada/${g.slug}/faq` },
    openGraph: { title, description, url: absUrl(`/canada/${g.slug}/faq`) },
  };
}

export default function FaqPage({ params }: { params: { game: string } }) {
  const g = getLiveGame(params.game);
  if (!g) notFound();
  const items = faqs(g.name, g.agency, g.drawDays);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: items.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <Link href="/canada">Canada</Link> /{" "}
            <Link href={`/canada/${g.slug}`}>{g.name}</Link> / <span>FAQ</span>
          </div>
          <div className="section-eyebrow">How to play</div>
          <h1 className="section-headline">
            {g.name} <em>questions.</em>
          </h1>
          <GameTabs slug={g.slug} active="faq" />
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <div className="prose">
            {items.map((f) => (
              <div key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
            <div className="notice" style={{ marginTop: 24 }}>
              <span className="notice-tag">19+</span>
              <span>
                Play for entertainment only. Need support? See{" "}
                <Link href="/responsible-play">responsible play resources</Link>.
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
