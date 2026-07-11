import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { countryName, operatorName, type GameConfig } from "@/config/games";
import { resolveGame, countryGameParams } from "@/lib/draws";
import { absUrl } from "@/lib/site";
import { GameTabs } from "@/components/draws/GameTabs";
import { JsonLd } from "@/components/site/JsonLd";
import { RelatedGuides } from "@/components/site/RelatedGuides";

export const dynamicParams = false;
export function generateStaticParams() {
  return countryGameParams();
}

type FaqItem = { q: string; a: string; more?: { href: string; label: string } };

function faqs(g: GameConfig): FaqItem[] {
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
    const nyGame = g.agency === "NY Lottery";
    const items: FaqItem[] = [
      {
        q: `Are ${name} winnings taxed in the US?`,
        a: `Yes. Lottery prizes are taxable income — the IRS withholds 24% up front and a jackpot ultimately owes up to 37%, and most states tax winnings too (New York is highest at 10.9% plus New York City's local tax; Florida and Texas take nothing).`,
        more: { href: "/guides/lottery-taxes-us-federal-and-state", label: "Federal + state tax breakdown" },
      },
    ];
    if (g.progressive) {
      items.push({
        q: `Lump sum or annuity — which should I take for ${name}?`,
        a: `Jackpot winners choose a reduced cash lump sum (roughly half the headline amount) or the full advertised jackpot as a 30-payment annuity over 29 years. You usually have just 60 days to elect the cash, or the annuity is paid by default.`,
        more: { href: "/guides/lump-sum-vs-annuity-lottery", label: "The real math" },
      });
    }
    items.push(
      {
        q: `Can I claim a ${name} prize anonymously?`,
        a: nyGame
          ? `Not by name — New York publishes the winner's name and city. You can claim through a legally formed trust or LLC so the entity's name appears instead, but you still provide your SSN for tax reporting.`
          : `It depends on the state where you bought the ticket. Some states allow anonymity or a trust/LLC claim; most publish winners' names.`,
        more: { href: "/guides/anonymous-lottery-winners-by-state", label: "Anonymity by state" },
      },
      {
        q: `How long do I have to claim a ${name} prize?`,
        a: `Deadlines are set by the state where you bought the ticket — typically 90 days to one year from the draw${g.progressive ? ", and you usually have only ~60 days to choose the cash lump sum" : ""}.`,
        more: nyGame
          ? { href: "/guides/new-york-lottery-claim-guide", label: "New York claim guide" }
          : { href: "/guides/how-to-claim-powerball-mega-millions", label: "How to claim, step by step" },
      },
      ...common,
    );
    return items;
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
  // The regional corporation's step-by-step claim guide, by operating agency.
  const claimGuide: Record<string, string> = {
    OLG: "how-to-claim-a-lottery-prize-olg-ontario",
    WCLC: "how-to-claim-a-lottery-prize-wclc",
    BCLC: "how-to-claim-a-lottery-prize-bclc",
    "Loto-Québec": "how-to-claim-a-lottery-prize-loto-quebec",
    ALC: "how-to-claim-a-lottery-prize-alc",
  };
  const claimSlug = claimGuide[g.agency];
  const anon =
    g.agency === "OLG"
      ? `No. OLG posts a winner's name and city for 30 days on any prize of $1,000 or more, and requires a published photo at $10,000 or more — you cannot claim a major ${name} prize anonymously.`
      : `Generally no. Above a threshold, every Canadian corporation publishes a winner's name, town, and usually a photo; anonymity is granted only rarely, for a substantiated safety reason.`;
  return [
    {
      q: `Are ${name} winnings taxed in Canada?`,
      a: `No. A ${name} prize is a tax-free windfall — you keep 100%, with nothing withheld at either the federal or provincial level. Only the income you later earn by investing it is taxable.`,
      more: { href: "/guides/are-lottery-winnings-taxable-in-canada", label: "Read the full tax guide" },
    },
    {
      q: `How long do I have to claim a ${name} prize?`,
      a: `One year from the draw date. ${name} is run by ${operatorName(g)}: smaller prizes are paid at retailers, larger ones through its prize-claim process, and the prize is a single tax-free lump sum.`,
      more: claimSlug
        ? { href: `/guides/${claimSlug}`, label: "How to claim, step by step" }
        : { href: "/guides/what-to-do-if-you-win-the-lottery-in-canada", label: "What to do if you win" },
    },
    {
      q: `Can I stay anonymous if I win ${name}?`,
      a: anon,
      more: { href: "/guides/lottery-winner-anonymity-canada", label: "Anonymity rules, province by province" },
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
                {f.more ? (
                  <p style={{ marginTop: -8 }}>
                    <Link href={f.more.href}>{f.more.label} →</Link>
                  </p>
                ) : null}
              </div>
            ))}
            <div className="notice" style={{ marginTop: 24 }}>
              <span className="notice-tag">{g.country === "US" || g.country === "EU" ? "18+" : "19+"}</span>
              <span>
                Play for entertainment only. Need support? See{" "}
                <Link href="/responsible-play">responsible play resources</Link>.
              </span>
            </div>

            <RelatedGuides slug={g.slug} gameName={g.name} />
          </div>
        </div>
      </section>
    </>
  );
}
