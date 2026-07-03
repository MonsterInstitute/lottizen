import Link from "next/link";

/** Orange rounded-square "L" mark + serif "Lottizen" wordmark. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`logo ${className}`} aria-label="Lottizen home">
      <span className="logo-mark" aria-hidden="true">
        L
      </span>
      Lottizen
    </Link>
  );
}
