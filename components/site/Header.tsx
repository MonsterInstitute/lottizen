import Link from "next/link";
import { Logo } from "@/components/site/Logo";

export function Header() {
  return (
    <header className="site-nav">
      <div className="container nav-inner">
        <Logo />
        <nav className="nav-links">
          <Link href="/usa">USA</Link>
          <Link href="/canada">Canada</Link>
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
