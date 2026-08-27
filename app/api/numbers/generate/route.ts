import { NextResponse } from "next/server";
import { getCurrentSubscriber } from "@/lib/auth";
import { checkQuota, consumeQuota } from "@/lib/feature-quota";
import { generate, isMetered, isStrategy, type HistoryInput } from "@/lib/number-strategies";
import { getDraws, getStats } from "@/lib/draws";
import { GAMES } from "@/config/games";

/**
 * POST /api/numbers/generate — server-side number generation.
 *
 * Generation moved off the client because the free-tier monthly quota has to
 * be counted somewhere the user can't edit: the whole generator used to run in
 * the browser, where any gate was cosmetic and readable straight out of the JS
 * bundle.
 *
 * "quick" (pure random) stays unmetered and unauthenticated — it's the free
 * baseline, it protects nothing, and every generator page in the sitemap needs
 * it to work for a signed-out search visitor. Every other strategy is metered:
 * Plus unlimited, free one run per calendar month.
 *
 * NOTE none of these strategies improve the odds of winning, and the responses
 * here must never imply otherwise — see CLAUDE.md.
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

  // Unmetered path: no auth, no quota, no DB round trip.
  if (!isMetered(strategy)) {
    return NextResponse.json({
      ok: true,
      numbers: generate(strategy, game.max, game.pick, null),
      strategy,
      quota: { isPlus: false, runsLeft: null, metered: false },
    });
  }

  const subscriber = await getCurrentSubscriber();
  if (!subscriber) {
    return NextResponse.json(
      { ok: false, code: "SIGN_IN_REQUIRED", error: "Sign in to use this pick style." },
      { status: 401 },
    );
  }

  const verdict = await consumeQuota(subscriber.id, "weighted_generator");
  if (!verdict.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "QUOTA_EXHAUSTED",
        error: "You've used this month's free run. Lottizen Plus removes the limit.",
        quota: { isPlus: false, runsLeft: 0, metered: true },
      },
      { status: 403 },
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
    quota: {
      isPlus: verdict.isPlus,
      runsLeft: verdict.isPlus ? null : Math.max(0, (verdict.runsLeft ?? 1) - 1),
      metered: true,
    },
  });
}

/** GET — quota state for rendering the UI, without consuming a run. */
export async function GET() {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) {
    return NextResponse.json({ ok: true, signedIn: false, isPlus: false, runsLeft: 0 });
  }
  const verdict = await checkQuota(subscriber.id, "weighted_generator");
  return NextResponse.json({
    ok: true,
    signedIn: true,
    isPlus: verdict.isPlus,
    runsLeft: verdict.runsLeft,
  });
}
