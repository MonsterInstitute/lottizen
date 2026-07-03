import type { Metadata } from "next";
import { Playfair_Display, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { JsonLd } from "@/components/site/JsonLd";
import { SITE } from "@/lib/site";

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
    "Ontario scratch tickets",
    "OLG instant games",
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
};

const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE.name,
  url: SITE.url,
  description: SITE.description,
  slogan: SITE.tagline,
  areaServed: { "@type": "AdministrativeArea", name: "Ontario, Canada" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en-CA"
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
