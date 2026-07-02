/** Formatting helpers shared across pages. */

export function money(n: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact) {
    if (n >= 1_000_000) return `$${trim(n / 1_000_000)}M`;
    if (n >= 1_000) return `$${trim(n / 1_000)}K`;
  }
  return `$${Math.round(n).toLocaleString("en-CA")}`;
}

function trim(n: number): string {
  return n.toFixed(n < 10 && n % 1 !== 0 ? 1 : 0);
}

export function price(n: number): string {
  return `$${Math.round(n)}`;
}

/** "1 in 3.5" style odds. */
export function odds(n: number): string {
  if (!n) return "—";
  return `1 in ${n >= 100 ? Math.round(n).toLocaleString("en-CA") : n.toFixed(2)}`;
}

export function count(n: number): string {
  return n.toLocaleString("en-CA");
}

export function score(n: number): string {
  return n.toFixed(1);
}

/** e.g. 2026-07-02T22:55:19+00:00 -> "July 2, 2026". */
export function humanDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Toronto",
  });
}

export function humanDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Toronto",
  });
}
