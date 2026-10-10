import type { Metadata } from "next";
import Link from "next/link";
import { CHARITY_PROVINCES, isOpen, lotteriesIn } from "@/lib/charity";
import { absUrl } from "@/lib/site";
import { LotteryCard } from "@/components/charity/LotteryCard";

export const metadata: Metadata = {
  title: "Charity Lotteries in Canada: Home Lotteries and 50/50s by Province",
  description:
    "Every major hospital home lottery and team 50/50 in Canada, by province: deadlines, ticket caps, prizes and published odds from each lottery's own rules, current 50/50 pots and winning numbers.",
  alternates: { canonical: "/charity" },
  openGraph: { title: "Charity Lotteries in Canada · Lottizen", url: absUrl("/charity"), type: "website" },
};

/** Every province with charity lotteries on sale. A visitor whose province
 *  is known sees theirs (data-regions); the province list is always there. */
export default function CharityHub() {
  const provinces = CHARITY_PROVINCES.map((p) => ({ p, list: lotteriesIn(p.code).filter(isOpen) })).filter((x) => x.list.length);
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="section-eyebrow">Charity lotteries</div>
          <h1 className="section-headline">
            Home lotteries and <em>50/50s.</em>
          </h1>
          <p className="section-lede">
            Hospital and charity home lotteries and team 50/50s on sale now, by province, with each lottery&rsquo;s own
            published numbers: deadlines, how many tickets, how many prizes, the odds it states, and today&rsquo;s 50/50 pots.
            You can only buy a ticket while you&rsquo;re in the province that licenses it.
          </p>
          <nav className="picks-jump" aria-label="Provinces">
            {provinces.map(({ p }) => (
              <Link key={p.code} href={`/charity/${p.slug}`}>
                {p.name}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <section className="section" style={{ paddingTop: 24 }}>
        <div className="container">
          {provinces.map(({ p, list }) => (
            <div key={p.code} data-regions={p.region} className="picks-region">
              <div className="section-head-row">
                <h2 className="section-headline picks-region-title">{p.name}</h2>
                <Link href={`/charity/${p.slug}`} className="btn btn-secondary">
                  All {p.name} lotteries →
                </Link>
              </div>
              <div className="charity-grid">
                {list.slice(0, 9).map((l) => (
                  <LotteryCard key={l.id} l={l} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
