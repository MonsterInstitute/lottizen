import Link from "next/link";
import { Logo } from "@/components/site/Logo";
import { gamesForCountry, countrySlug, type Country } from "@/config/games";
import { hasData } from "@/lib/draws";
import { SITE } from "@/lib/site";
import { SubscribeForm } from "@/components/site/SubscribeForm";

/**
 * Five columns by function. The Results column lists Canada, the USA and
 * Europe for everyone, whatever their region (internal links for every
 * region's results). The Scratch column is Canada-only (data-country-scope).
 * No links to noindex pages.
 */
export function Footer() {
  const top = (code: Country, n: number) =>
    gamesForCountry(code).filter((g) => g.live && hasData(g.slug)).slice(0, n);
  // Not region-scoped: every visitor (and crawler) sees all three regions.
  const region = (code: Country, label: string, all: string) => (
    <div className="footer-region">
      <span className="footer-sub">
        <Link href={`/${countrySlug(code)}`}>{label}</Link>
      </span>
      <ul>
        {top(code, 4).map((g) => (
          <li key={g.slug}>
            <Link href={`/${countrySlug(code)}/${g.slug}`}>{g.name}</Link>
          </li>
        ))}
        <li>
          <Link href={`/${countrySlug(code)}`}>{all}</Link>
        </li>
      </ul>
    </div>
  );
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <Logo />
            <p>
              Canadian, US and European lottery results, statistics and number tools, and a scratch-ticket
              tracker for Canada&rsquo;s five lottery agencies. Independent, rebuilt daily.
            </p>
          </div>
          <div className="footer-col">
            <h5>Get numbers by email</h5>
            <SubscribeForm />
          </div>
        </div>

        <div className="footer-cols">
          <div className="footer-col">
            <h5>Results</h5>
            {region("CA", "Canada", "All Canadian games")}
            {region("US", "USA", "All US games")}
            {region("EU", "Europe", "All European games")}
          </div>
          <div className="footer-col" data-country-scope="CA">
            <h5>Scratch &amp; charity</h5>
            <ul>
              <li>
                <Link href="/picks">This week&rsquo;s picks</Link>
              </li>
              <li>
                <Link href="/scratch">Scratch rankings</Link>
              </li>
              <li>
                <Link href="/charity">Charity lotteries</Link>
              </li>
              <li>
                <Link href="/news/did-anyone-win-lotto-max">Did anyone win?</Link>
              </li>
              <li>
                <Link href="/dashboard#tickets">My tickets</Link>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h5>Tools &amp; statistics</h5>
            <ul>
              <li>
                <Link href="/statistics">Statistics</Link>
              </li>
              <li>
                <Link href="/generator">Number tools</Link>
              </li>
              <li>
                <Link href="/embed">Free widgets</Link>
              </li>
              <li>
                <Link href="/api">Data API</Link>
              </li>
              <li>
                <Link href="/dashboard">My Lottizen</Link>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h5>Guides &amp; news</h5>
            <ul>
              <li>
                <Link href="/guides">Guides</Link>
              </li>
              <li>
                <Link href="/news">News</Link>
              </li>
              <li>
                <a href="/news/rss.xml">News RSS</a>
              </li>
              <li>
                <Link href="/unclaimed">Unclaimed prizes</Link>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h5>About</h5>
            <ul>
              <li>
                <Link href="/methodology">Methodology</Link>
              </li>
              <li>
                <Link href="/press">Press &amp; data</Link>
              </li>
              <li>
                <Link href="/data/canada-lottery-almanac">Data almanac</Link>
              </li>
              <li>
                <Link href="/terms">Terms</Link>
              </li>
              <li>
                <Link href="/responsible-play">Responsible play</Link>
              </li>
              <li>
                <a href="https://www.playsmart.ca/" target="_blank" rel="noopener noreferrer nofollow">
                  PlaySmart
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <div>© MMXXVI {SITE.name.toUpperCase()} · INDEPENDENT · NOT A LOTTERY OPERATOR · 18/19+</div>
          <div>
            <Link href="/methodology">METHODOLOGY</Link>
            <Link href="/responsible-play">RESPONSIBLE PLAY</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
