import type { Metadata } from "next";
import Link from "next/link";
import { absUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Lottizen's terms of service: what the site is and isn't, acceptable use of the data, and responsible play.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="section-eyebrow">Legal</div>
          <h1 className="section-headline">
            Terms of <em>service.</em>
          </h1>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <div className="prose">
            <h2>What Lottizen is</h2>
            <p>
              Lottizen (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is an independent information and
              tracking tool. We are not a lottery operator, are not affiliated with or endorsed by
              OLG, BCLC, WCLC, ALC, Loto-Québec, or any other lottery agency, and do not sell
              lottery tickets. Rankings and value scores are derived from each agency&rsquo;s own
              published data and do not predict draw outcomes or improve your odds of winning any
              game of chance.
            </p>

            <h2>Paid plans</h2>
            <p>
              Lottizen currently has no paid subscriptions — every feature on lottizen.com is free.
              Plans for our <Link href="/api">Data API</Link> are sold and billed by RapidAPI, under
              RapidAPI&rsquo;s own terms.
            </p>

            <h2>Acceptable use</h2>
            <p>
              Don&rsquo;t use Lottizen to scrape, resell, or redistribute our data outside the
              terms of our public API (see <Link href="/api">/api</Link>). We may suspend accounts
              that abuse the service.
            </p>

            <h2>No warranty</h2>
            <p>
              Data is sourced from public lottery-operator feeds and may be delayed, incomplete, or
              contain errors. Always confirm current prize information with the official lottery
              operator before purchasing a ticket. Lottizen is provided &ldquo;as is&rdquo; without
              warranty of any kind.
            </p>

            <h2>Responsible play</h2>
            <p>
              Lottery games are a form of gambling. Play for entertainment only. If gambling stops
              being fun, help is free and confidential — see{" "}
              <Link href="/responsible-play">responsible play</Link>.
            </p>

            <h2>Contact</h2>
            <p>
              Questions about these terms: reach us via the links on{" "}
              <a href={absUrl("/")}>lottizen.com</a>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
