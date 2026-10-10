import Link from "next/link";
import { Logo } from "@/components/site/Logo";
import { RegionSelect } from "@/components/home/RegionSelect";

/**
 * Navigation for the visitor's region. Every entry is in the HTML; entries
 * scoped to another country (data-country-scope) are hidden once the
 * visitor's country is known (RegionScript). With no known region every
 * entry shows, and the per-country results links read "Canada / USA /
 * Europe" instead of "Results". The region dropdown on the right switches.
 */
export function Header() {
  const results = (code: string, href: string, name: string) => (
    <Link href={href} data-country-scope={code}>
      <span className="when-known">Results</span>
      <span className="when-unknown">{name}</span>
    </Link>
  );
  return (
    <header className="site-nav">
      <div className="container nav-inner">
        <Logo />
        <nav className="nav-links">
          <Link href="/picks" data-country-scope="CA">
            This week
          </Link>
          {results("CA", "/canada", "Canada")}
          {results("US", "/usa", "USA")}
          {results("EU", "/europe", "Europe")}
          <Link href="/scratch" data-country-scope="CA">
            Scratch
          </Link>
          <Link href="/statistics">Statistics</Link>
          <Link href="/generator">Tools</Link>
          <Link href="/guides">Guides</Link>
          <Link href="/news" data-country-scope="CA">
            News
          </Link>
          <Link href="/dashboard#tickets">My tickets</Link>
        </nav>
        <div className="nav-right">
          <RegionSelect compact />
          <Link href="/dashboard" className="nav-cta">
            My Lottizen
          </Link>
        </div>
      </div>
    </header>
  );
}
