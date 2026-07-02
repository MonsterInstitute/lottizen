import type { Metadata } from "next";
import {
  Big_Shoulders_Display,
  Newsreader,
  Plus_Jakarta_Sans,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Ticker } from "@/components/site/Ticker";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { JsonLd } from "@/components/site/JsonLd";
import { SITE, absUrl } from "@/lib/site";

const display = Big_Shoulders_Display({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700", "900"],
  variable: "--font-display",
  display: "swap",
});
const serif = Newsreader({
  subsets: ["latin"],
  style: ["italic", "normal"],
  weight: ["400", "500"],
  variable: "--font-serif",
  display: "swap",
  adjustFontFallback: false, // Newsreader ships no size-adjust metrics; skip the override probe
});
const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
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
    default: `${SITE.name} — ${SITE.tagline}`,
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

// Set the theme before first paint to avoid a flash.
const themeInit = `(function(){try{var t=localStorage.getItem('lottizen-theme');document.documentElement.setAttribute('data-theme',t==='night'?'night':'day');}catch(e){document.documentElement.setAttribute('data-theme','day');}})();`;

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
      data-theme="day"
      className={`${display.variable} ${serif.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <JsonLd data={orgJsonLd} />
      </head>
      <body>
        <ThemeToggle />
        <Ticker />
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
