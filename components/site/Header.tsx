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
          <Link href="/usa/powerball/statistics">Statistics</Link>
          <Link href="/usa/powerball/generator">Number Tools</Link>
          <Link href="/scratch">Scratch</Link>
        </nav>
        <div className="nav-right">
          <Link href="/usa" className="nav-cta">
            All games
          </Link>
        </div>
      </div>
    </header>
  );
}
