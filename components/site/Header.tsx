import Link from "next/link";
import { Logo } from "@/components/site/Logo";
import { RegionLink } from "@/components/site/RegionLink";

export function Header() {
  return (
    <header className="site-nav">
      <div className="container nav-inner">
        <Logo />
        <nav className="nav-links">
          <RegionLink region="US" href="/usa">
            USA
          </RegionLink>
          <RegionLink region="CA" href="/canada">
            Canada
          </RegionLink>
          <RegionLink region="EU" href="/europe">
            Europe
          </RegionLink>
          <Link href="/statistics">Statistics</Link>
          <Link href="/generator">Tools</Link>
          <Link href="/guides">Guides</Link>
          <Link href="/scratch">Scratch value</Link>
          <Link href="/api">API</Link>
        </nav>
        <div className="nav-right">
          <Link href="/dashboard" className="nav-cta">
            My Lottizen
          </Link>
        </div>
      </div>
    </header>
  );
}
