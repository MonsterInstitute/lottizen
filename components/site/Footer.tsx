import Link from "next/link";
import { Logo } from "@/components/site/Logo";
import { getActivePricePoints } from "@/lib/data";
import { SITE } from "@/lib/site";

export function Footer() {
  const prices = getActivePricePoints();
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Logo />
            <p>
              {SITE.tagline} Independent value rankings for Ontario scratch
              tickets, rebuilt every morning from OLG&rsquo;s public
              instant-game prize data.
            </p>
          </div>
          <div className="footer-col">
            <h5>Rankings</h5>
            <ul>
              <li>
                <Link href="/">Today&rsquo;s Top Value</Link>
              </li>
              {prices.slice(0, 4).map((p) => (
                <li key={p}>
                  <Link href={`/price/${p}`}>${p} Tickets</Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="footer-col">
            <h5>Learn</h5>
            <ul>
              <li>
                <Link href="/methodology">Value Score Method</Link>
              </li>
              <li>
                <Link href="/responsible-play">Responsible Play</Link>
              </li>
              <li>
                <a
                  href="https://www.olg.ca/en/winners/unclaimed-instant-prizes.html"
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  OLG Unclaimed Prizes
                </a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h5>Care</h5>
            <ul>
              <li>
                <a
                  href="https://www.playsmart.ca/"
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  PlaySmart
                </a>
              </li>
              <li>
                <a
                  href="https://www.connexontario.ca/"
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  ConnexOntario
                </a>
              </li>
              <li>
                <Link href="/responsible-play">Self-Exclusion</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <div>
            © MMXXVI {SITE.name.toUpperCase()} · NOT AFFILIATED WITH OLG · 19+
          </div>
          <div>
            <Link href="/methodology">METHODOLOGY</Link>
            <Link href="/responsible-play">RESPONSIBLE PLAY</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
