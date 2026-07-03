import Link from "next/link";
import { Logo } from "@/components/site/Logo";

export function Header() {
  return (
    <header className="site-nav">
      <div className="container nav-inner">
        <Logo />
        <nav className="nav-links">
          <Link href="/">Rankings</Link>
          <Link href="/price/5">By price</Link>
          <Link href="/methodology">How it works</Link>
          <Link href="/responsible-play">Play smart</Link>
        </nav>
        <div className="nav-right">
          <Link href="/methodology" className="nav-signin">
            Methodology
          </Link>
          <Link href="/" className="nav-cta">
            Today&rsquo;s picks
          </Link>
        </div>
      </div>
    </header>
  );
}
