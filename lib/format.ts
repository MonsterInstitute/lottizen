/** Formatting helpers shared across pages. */

const CURRENCY_SYMBOL: Record<string, string> = { CAD: "$", USD: "$", EUR: "€", GBP: "£" };

/** The currency symbol for a code ("$", "€", "£"). */
export function currencySymbol(currency?: string): string {
  return CURRENCY_SYMBOL[currency ?? "CAD"] ?? "$";
}

/** Exact ticket price with its currency symbol, e.g. "€2.50", "£2.00", "$3.00". */
export function priceAmount(n: number, currency?: string): string {
  return `${currencySymbol(currency)}${n.toFixed(2)}`;
}

export function money(
  n: number,
  opts: { compact?: boolean; currency?: "CAD" | "USD" | "EUR" | "GBP" } = {},
): string {
  const s = CURRENCY_SYMBOL[opts.currency ?? "CAD"] ?? "$";
  if (opts.compact) {
    if (n >= 1_000_000) return `${s}${trim(n / 1_000_000)}M`;
    if (n >= 1_000) return `${s}${trim(n / 1_000)}K`;
  }
  return `${s}${Math.round(n).toLocaleString("en-CA")}`;
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

/** "1 draw" / "743 draws" — count with a correctly pluralized noun. */
export function nDraws(n: number): string {
  return `${n.toLocaleString("en-CA")} draw${n === 1 ? "" : "s"}`;
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

/** "2026-06-30" -> "Tue, Jun 30, 2026" (date-only, no TZ shift). */
export function drawDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-CA", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const WEEKDAY: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};

/** Next upcoming draw date ("YYYY-MM-DD") derived from a game's draw-day schedule,
 *  evaluated at build time (the site rebuilds daily). Daily/nightly games return
 *  today; weekly games return the nearest scheduled weekday on/after today. Used as
 *  a fallback so every game shows a real next draw date instead of a blank or "TBA". */
export function nextDrawDate(drawDays: string[], now: Date = new Date()): string {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const [y, m, d] = s.split(/\D+/).filter(Boolean).map(Number);
  const base = Date.UTC(y, m - 1, d);
  const isDaily = drawDays.some((x) => /daily|night/i.test(x)) || drawDays.length >= 7;
  if (isDaily) return new Date(base).toISOString().slice(0, 10);
  const wanted = new Set(
    drawDays.map((x) => WEEKDAY[x]).filter((n): n is number => n !== undefined),
  );
  for (let off = 0; off < 8; off++) {
    const dt = new Date(base + off * 86_400_000);
    if (wanted.has(dt.getUTCDay())) return dt.toISOString().slice(0, 10);
  }
  return new Date(base).toISOString().slice(0, 10);
}

export function humanDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Toronto",
  });
}
