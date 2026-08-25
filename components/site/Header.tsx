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
          {/* Replaces the "API" nav-links slot (still reachable from the
              footer's "Data API" link) rather than adding a 9th item —
              this row overflowed at laptop widths before (see the earlier
              header-declutter fix) and Plus is the higher-priority entry
              point now. */}
          <Link href="/plus" className="nav-plus">
            Plus
          </Link>
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
