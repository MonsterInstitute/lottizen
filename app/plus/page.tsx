import type { Metadata } from "next";
import { PLANS } from "@/lib/plans";
import { FAQ } from "@/lib/plus-content";
import { SITE, absUrl } from "@/lib/site";
import { JsonLd } from "@/components/site/JsonLd";
import { PlusPricingClient } from "@/components/site/PlusPricingClient";

const TITLE = "Lottizen Plus — Know Which Scratch Ticket Still Has Money Left";
const DESCRIPTION =
  "Two $20 scratch tickets can be worth wildly different amounts once the big prizes are claimed. Lottizen Plus tracks remaining prize data across all 5 Canadian lottery agencies. $3 CAD/month or $30 CAD/year, 7-day free trial.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/plus" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: absUrl("/plus"),
    type: "website",
  },
};

export default function PlusPricingPage() {
  // This page previously shipped with NO metadata and NO structured data at
  // all (it was a "use client" component — Next.js can't export metadata
  // from one). Split into this server component (metadata + JSON-LD,
  // guaranteed present in the initial HTML) and a client sub-component for
  // the interactive checkout buttons.
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Lottizen Plus",
    description: metadata.description,
    brand: { "@type": "Brand", name: SITE.name },
    url: absUrl("/plus"),
    offers: [
      {
        "@type": "Offer",
        name: "Lottizen Plus — Monthly",
        price: PLANS.plus.priceMonthly.toFixed(2),
        priceCurrency: "CAD",
        url: absUrl("/plus"),
        availability: "https://schema.org/InStock",
      },
      {
        "@type": "Offer",
        name: "Lottizen Plus — Annual",
        price: PLANS.plus.priceAnnual.toFixed(2),
        priceCurrency: "CAD",
        url: absUrl("/plus"),
        availability: "https://schema.org/InStock",
      },
    ],
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <JsonLd data={[productJsonLd, faqJsonLd]} />
      <PlusPricingClient />
    </>
  );
}
