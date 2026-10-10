import type { Metadata } from "next";
import Link from "next/link";

// Lottizen Plus (the only thing ever sold on lottizen.com) was retired on
// 2026-10-09, so there is nothing here to refund. Kept live for old links;
// not indexed.
export const metadata: Metadata = {
  title: "Refund Policy",
  description: "Lottizen doesn't sell any subscriptions on lottizen.com, so there's nothing to refund.",
  robots: { index: false, follow: true },
};

export default function RefundPolicyPage() {
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="section-eyebrow">Legal</div>
          <h1 className="section-headline">
            Refund <em>policy.</em>
          </h1>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <div className="prose">
            <p>
              Lottizen doesn&rsquo;t currently sell anything on lottizen.com — Lottizen Plus has been
              retired and every feature is free — so there&rsquo;s nothing here to refund.
            </p>
            <p>
              Plans for our <Link href="/api">Data API</Link> are sold and billed by RapidAPI, under
              RapidAPI&rsquo;s own terms.
            </p>
            <p className="field-hint" style={{ marginTop: 24 }}>
              See also our <Link href="/terms">terms of service</Link>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
