import Link from "next/link";
import { Logo } from "@/components/site/Logo";

export function Header() {
  return (
    <nav className="site-nav">
      <div className="container nav-inner">
        <Logo />
        <div className="nav-links">
          <Link href="/">Rankings</Link>
          <Link href="/price/5">By Price</Link>
          <Link href="/methodology">Methodology</Link>
          <Link href="/responsible-play">Play Smart</Link>
          <Link href="/methodology" className="nav-cta">
            How It Works
          </Link>
        </div>
      </div>
    </nav>
  );
}
