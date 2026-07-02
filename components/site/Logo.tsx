import Link from "next/link";

/** Wordmark + scratch-ticket triangle mark, ported from the v5 header. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`logo ${className}`} aria-label="Lottizen home">
      <span className="logo-mark" />
      Lottizen
    </Link>
  );
}
