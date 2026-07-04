import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { countryName, operatorName, type GameConfig } from "@/config/games";
import { resolveGame, countryGameParams } from "@/lib/draws";
import { absUrl } from "@/lib/site";
import { GameTabs } from "@/components/draws/GameTabs";
import { JsonLd } from "@/components/site/JsonLd";

export const dynamicParams = false;
export function generateStaticParams() {
  return countryGameParams();
}

function faqs(g: GameConfig) {
  const name = g.name;
  const days = g.drawDays.join(" and ");
  const common = [
    {
      q: `When is the ${name} cut-off?`,
      a: `Ticket sales close shortly before each ${name} draw on ${days} evening. Buy before the cut-off to be entered for that night's draw.`,
    },
    {
      q: `Does Lottizen sell ${name} tickets?`,
      a: `No. Lottizen is an independent information site — we track winning numbers and statistics only. Buy tickets from ${operatorName(g)} or an authorized retailer.`,
    },
  ];
  if (g.country === "US") {
    return [
      {
        q: `Are ${name} winnings taxed in the US?`,
        a: `Yes. Lottery prizes are taxable income. The IRS withholds 24% federally up front and top winners owe up to 37%; most states also tax winnings (a few — including Florida, Texas and California — don't tax state lottery prizes). Consult a tax professional.`,
      },
      {
        q: `Lump sum or annuity — which should I take for ${name}?`,
        a: `Jackpot winners choose a reduced immediate cash lump sum or the full advertised amount paid as an annuity over ~29 years. The lump sum is smaller but invested on your terms; the annuity pays more in total and spreads the tax. It's a personal financial decision.`,
      },
      {
        q: `Can I claim a ${name} prize anonymously?`,
        a: `It depends on the state you bought in. Some states allow anonymity or claiming via a trust/LLC; others publish winners' names. Check the rules of the lottery where you purchased.`,
      },
      {
        q: `How long do I have to claim a ${name} prize?`,
        a: `Claim deadlines are set per state, typically 180 days to one year from the draw. Confirm with the lottery where you bought the ticket.`,
      },
      ...common,
    ];
  }
  if (g.country === "EU") {
    const uk = g.agency === "UK National Lottery";
    const taxQ = uk
      ? {
          q: `Are ${name} winnings taxed in the UK?`,
          a: `No. UK National Lottery prizes are paid completely tax-free — you keep 100% of the winnings. (Interest later earned on the money is taxable, and large gifts can carry inheritance-tax implications.)`,
        }
      : {
          q: `Are ${name} winnings taxed?`,
          a: `It depends where the ticket was bought. ${name} is a multi-country game and each country taxes prizes differently: the UK and Ireland pay out entirely tax-free, France taxes only the interest earned afterwards, while Spain withholds 20% on the part of a prize above €40,000 and Portugal 20% above €5,000. Your prize is paid and taxed under the rules of the country of purchase.`,
        };
    const claimQ = uk
      ? {
          q: `Where do I claim a ${name} prize?`,
          a: `From The National Lottery (operated by Allwyn) — smaller prizes at retailers or in the app, larger prizes by post or in person. You have 180 days from the draw date to claim.`,
        }
      : {
          q: `I bought a ${name} ticket abroad — where do I claim?`,
          a: `You claim in the country where you bought the ticket, in that country's currency and under its rules — you can't buy in one country and collect in another. Each participating lottery pays its own winners; the shared prize pool is converted at the draw-day exchange rate.`,
        };
    const anonQ = uk
      ? {
          q: `Can I stay anonymous if I win ${name}?`,
          a: `Yes. UK National Lottery winners can choose to stay completely anonymous — your name and details are only ever published if you agree to publicity.`,
        }
      : {
          q: `Can I stay anonymous if I win ${name}?`,
          a: `It depends on the country of purchase. UK and Irish winners may remain anonymous; some countries (for example Spain, Portugal and Austria) publish or may publish winner details. Check the rules of the lottery where you bought the ticket.`,
        };
    const deadlineQ = {
      q: `How long do I have to claim a ${name} prize?`,
      a: uk
        ? `180 days from the draw date for UK National Lottery games.`
        : `Claim deadlines vary by country, typically 90 days to 2 years from the draw (180 days in the UK, 90 days in Ireland). Confirm with the lottery where you purchased.`,
    };
    return [taxQ, claimQ, anonQ, deadlineQ, ...common];
  }
  const anon =
    g.agency === "OLG"
      ? "No. In Ontario, OLG publishes the name and municipality of prize winners — you cannot claim a major prize anonymously."
      : "Rules vary by province. Most Canadian lottery corporations publish winners' names; check your provincial corporation's rules.";
  return [
    {
      q: `Are ${name} winnings taxed in Canada?`,
      a: `No. Lottery winnings are tax-free in Canada — you keep 100% of the prize. Income later earned from investing the winnings can be taxable.`,
    },
    {
      q: `How long do I have to claim a ${name} prize?`,
      a: `In most Canadian provinces you have 12 months from the draw date to claim. Confirm the deadline and process with ${operatorName(g)}.`,
    },
    {
      q: `Can I stay anonymous if I win ${name}?`,
      a: anon,
    },
    ...common,
  ];
}

export function generateMetadata({ params }: { params: { country: string; game: string } }): Metadata {
  const g = resolveGame(params.country, params.game);
  if (!g) return {};
  const title = `${g.name} FAQ — Cut-off, Claim Deadline, Taxes`;
  const description = `${g.name} FAQ: ticket cut-off times, prize claim deadlines, taxes, and winner anonymity rules.`;
  return {
    title,
    description,
    alternates: { canonical: `/${params.country}/${g.slug}/faq` },
    openGraph: { title, description, url: absUrl(`/${params.country}/${g.slug}/faq`) },
  };
}

export default function FaqPage({ params }: { params: { country: string; game: string } }) {
  const g = resolveGame(params.country, params.game);
  if (!g) notFound();
  const base = `/${params.country}/${g.slug}`;
  const items = faqs(g);

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
            <Link href={`/${params.country}`}>{countryName(g.country)}</Link> /{" "}
            <Link href={base}>{g.name}</Link> / <span>FAQ</span>
          </div>
          <div className="section-eyebrow">How to play</div>
          <h1 className="section-headline">
            {g.name} <em>questions.</em>
          </h1>
          <GameTabs country={params.country} slug={g.slug} active="faq" />
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
              <span className="notice-tag">{g.country === "US" || g.country === "EU" ? "18+" : "19+"}</span>
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
