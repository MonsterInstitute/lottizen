import Link from "next/link";
import { Logo } from "@/components/site/Logo";
import { RegionLink } from "@/components/site/RegionLink";

export function Header() {
  return (
    <header className="site-nav">
      <div className="container nav-inner">
        <Logo />
        {/* Two user features lead (this week's pick/skip, your tickets);
            statistics, tools, guides and news live in the footer. */}
        <nav className="nav-links">
          <Link href="/">This week</Link>
          <Link href="/scratch">Scratch tickets</Link>
          <span className="nav-results">
            Results:{" "}
            <RegionLink region="CA" href="/canada">
              Canada
            </RegionLink>
            <RegionLink region="US" href="/usa">
              USA
            </RegionLink>
            <RegionLink region="EU" href="/europe">
              Europe
            </RegionLink>
          </span>
        </nav>
        <div className="nav-right">
          <Link href="/dashboard" className="nav-cta">
            My tickets
          </Link>
        </div>
      </div>
    </header>
  );
}
