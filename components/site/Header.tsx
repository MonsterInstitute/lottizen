import Link from "next/link";
import { Logo } from "@/components/site/Logo";

export function Header() {
  return (
    <header className="site-nav">
      <div className="container nav-inner">
        <Logo />
        <nav className="nav-links">
          <Link href="/canada">Results</Link>
          <Link href="/canada/lotto-max/statistics">Statistics</Link>
          <Link href="/canada/lotto-max/generator">Number Tools</Link>
          <Link href="/scratch">Scratch Tracker</Link>
          <Link href="/canada/lotto-max/faq">How to Play</Link>
        </nav>
        <div className="nav-right">
          <Link href="/canada" className="nav-cta">
            All games
          </Link>
        </div>
      </div>
    </header>
  );
}
