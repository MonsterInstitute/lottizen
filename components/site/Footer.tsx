import Link from "next/link";
import { Logo } from "@/components/site/Logo";
import { gamesForCountry, countrySlug } from "@/config/games";
import { hasData } from "@/lib/draws";
import { SITE } from "@/lib/site";
import { SubscribeForm } from "@/components/site/SubscribeForm";

export function Footer() {
  const top = (code: "CA" | "US") =>
    gamesForCountry(code).filter((g) => g.live && hasData(g.slug)).slice(0, 5);
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Logo />
            <p>
              Canadian &amp; US lottery winning numbers, statistics, and number tools — plus a
              scratch-ticket value tracker. Independent, rebuilt daily.
            </p>
          </div>
          <div className="footer-col" style={{ minWidth: 240 }}>
            <h5>Get numbers by email</h5>
            <SubscribeForm />
          </div>
          <div className="footer-col">
            <h5>USA</h5>
            <ul>
              {top("US").map((g) => (
                <li key={g.slug}>
                  <Link href={`/usa/${g.slug}`}>{g.name}</Link>
                </li>
              ))}
              <li>
                <Link href="/usa">All US games</Link>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h5>Canada</h5>
            <ul>
              {top("CA").map((g) => (
                <li key={g.slug}>
                  <Link href={`/canada/${g.slug}`}>{g.name}</Link>
                </li>
              ))}
              <li>
                <Link href="/canada">All Canadian games</Link>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h5>More</h5>
            <ul>
              <li>
                <Link href="/plus" style={{ color: "var(--brand-deep)", fontWeight: 600 }}>
                  Lottizen Plus
                </Link>
              </li>
              <li>
                <Link href="/dashboard">My Lottizen</Link>
              </li>
              <li>
                <Link href="/scratch">Scratch Value Tracker</Link>
              </li>
              <li>
                <Link href="/api">Data API</Link>
              </li>
              <li>
                <Link href="/methodology">Scratch Methodology</Link>
              </li>
              <li>
                <Link href="/responsible-play">Responsible Play</Link>
              </li>
              <li>
                <Link href="/terms">Terms</Link>
              </li>
              <li>
                <Link href="/refund-policy">Refund Policy</Link>
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
