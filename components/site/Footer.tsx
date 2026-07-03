import Link from "next/link";
import { Logo } from "@/components/site/Logo";
import { LIVE_GAMES } from "@/config/games";
import { SITE } from "@/lib/site";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Logo />
            <p>
              Canadian lottery winning numbers, statistics, and number tools —
              plus a scratch-ticket value tracker. Independent, rebuilt daily.
            </p>
          </div>
          <div className="footer-col">
            <h5>Games</h5>
            <ul>
              {LIVE_GAMES.map((g) => (
                <li key={g.slug}>
                  <Link href={`/canada/${g.slug}`}>{g.name}</Link>
                </li>
              ))}
              <li>
                <Link href="/canada">All of Canada</Link>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h5>Tools</h5>
            <ul>
              <li>
                <Link href="/canada/lotto-max/statistics">Number Statistics</Link>
              </li>
              <li>
                <Link href="/canada/lotto-max/generator">Number Generator</Link>
              </li>
              <li>
                <Link href="/scratch">Scratch Value Tracker</Link>
              </li>
              <li>
                <Link href="/methodology">Scratch Methodology</Link>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h5>Care</h5>
            <ul>
              <li>
                <a href="https://www.playsmart.ca/" target="_blank" rel="noopener noreferrer nofollow">
                  PlaySmart
                </a>
              </li>
              <li>
                <a href="https://www.connexontario.ca/" target="_blank" rel="noopener noreferrer nofollow">
                  ConnexOntario
                </a>
              </li>
              <li>
                <Link href="/responsible-play">Responsible Play</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <div>© MMXXVI {SITE.name.toUpperCase()} · INDEPENDENT · NOT A LOTTERY OPERATOR · 19+</div>
          <div>
            <Link href="/methodology">METHODOLOGY</Link>
            <Link href="/responsible-play">RESPONSIBLE PLAY</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
