import type { Metadata } from "next";
import { Playfair_Display, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { JsonLd } from "@/components/site/JsonLd";
import { SITE, absUrl } from "@/lib/site";

const serif = Playfair_Display({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["500", "600", "700", "800", "900"],
  variable: "--font-serif",
  display: "swap",
});
const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — Canadian Lottery Numbers & Statistics`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "Canadian scratch tickets",
    "scratch ticket value tracker",
    "best scratch ticket to buy",
    "scratch ticket odds",
    "remaining top prizes",
    "lottery value score",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    url: SITE.url,
    locale: SITE.locale,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    site: SITE.twitter,
  },
  robots: { index: true, follow: true },
  category: "reference",
  // Bing Webmaster Tools site-ownership verification.
  verification: { other: { "msvalidate.01": "DDAB0B990C5093BD6479EC3A8ED9D624" } },
};

const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE.name,
  url: SITE.url,
  description: SITE.description,
  slogan: SITE.tagline,
  logo: absUrl("/apple-icon.png"),
  // Repo's first commit (2026-07-02) — the only real "site went live" date
  // on record; not a guess.
  foundingDate: "2026-07-02",
  // Was hardcoded to a single "Ontario, Canada" AdministrativeArea — wrong
  // on every /usa and /europe page too, a self-contradictory geo signal to
  // search engines. Real coverage: all of Canada (5 provincial scratch
  // agencies + national/regional draw games), the US, and the European
  // countries EuroMillions/EuroJackpot/UK Lotto actually serve (kept in
  // sync by hand with middleware.ts's EU_COUNTRIES geo-routing set).
  areaServed: [
    { "@type": "Country", name: "Canada" },
    { "@type": "Country", name: "United States" },
    { "@type": "Country", name: "United Kingdom" },
    { "@type": "Country", name: "Ireland" },
    { "@type": "Country", name: "France" },
    { "@type": "Country", name: "Spain" },
    { "@type": "Country", name: "Portugal" },
    { "@type": "Country", name: "Austria" },
    { "@type": "Country", name: "Belgium" },
    { "@type": "Country", name: "Switzerland" },
    { "@type": "Country", name: "Luxembourg" },
  ],
  // sameAs (official social profiles) intentionally omitted — SITE.twitter
  // ("@lottizen") is only ever used for the twitter:site meta tag, with no
  // link anywhere confirming it's a real, owned, live account. Flagged to
  // the user rather than guessed; add real profile URLs here once confirmed.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
    >
      <head>
        <JsonLd data={orgJsonLd} />
      </head>
      <body>
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
