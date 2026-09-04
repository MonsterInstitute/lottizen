import { NextResponse } from "next/server";
import { generate, isStrategy, type HistoryInput } from "@/lib/number-strategies";
import { getDraws, getStats } from "@/lib/draws";
import { GAMES } from "@/config/games";

/**
 * POST /api/numbers/generate — number generation, free and unlimited for
 * everyone, signed in or not.
 *
 * This briefly carried a free-tier monthly quota on the stats-weighted
 * strategies. That was the wrong call and it's been removed: generation and
 * backtesting are RETENTION features, not monetisation ones. Metering them
 * bought no conversions and cost return visits — the generator pages are a
 * search entry point, and a visitor who lands on one and hits a wall doesn't
 * upgrade, they leave. Lottizen Plus differentiates on the ticket wallet
 * (auto-checking, win alerts, claim-deadline countdowns) and the scratch
 * analysis tools instead.
 *
 * Still server-side rather than back in the browser: that part of the
 * architecture was right independently of the gating. It keeps the algorithms
 * out of the client bundle, lets strategies use the full draw history without
 * shipping it, and leaves one place to change them.
 *
 * HONESTY CONSTRAINT (CLAUDE.md): no strategy here improves the odds of
 * winning, and no response or copy may imply it does.
 */
export async function POST(req: Request) {
  let body: { gameSlug?: string; strategy?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const strategy = body.strategy || "quick";
  if (!isStrategy(strategy)) {
    return NextResponse.json({ ok: false, error: "Unknown strategy." }, { status: 400 });
  }
  const game = GAMES.find((g) => g.slug === body.gameSlug);
  if (!game) {
    return NextResponse.json({ ok: false, error: "Unknown game." }, { status: 400 });
  }
  if (game.format === "digit") {
    return NextResponse.json(
      { ok: false, error: "Digit games don't use a number pool." },
      { status: 400 },
    );
  }

  const stats = getStats(game.slug);
  const draws = getDraws(game.slug);
  const history: HistoryInput | null =
    stats || draws
      ? {
          frequency: Object.fromEntries((stats?.numbers ?? []).map((s) => [s.n, s.count])),
          recent: (draws?.draws ?? []).map((d) => d.numbers),
        }
      : null;

  return NextResponse.json({
    ok: true,
    numbers: generate(strategy, game.max, game.pick, history),
    strategy,
  });
}
