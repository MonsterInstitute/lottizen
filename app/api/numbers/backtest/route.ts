import { NextResponse } from "next/server";
import { getCurrentSubscriber } from "@/lib/auth";
import { checkQuota, consumeQuota } from "@/lib/feature-quota";
import { backtest } from "@/lib/number-strategies";
import { getDraws } from "@/lib/draws";
import { GAMES } from "@/config/games";

/**
 * POST /api/numbers/backtest — check a combination against every recorded draw
 * for that game. Plus unlimited; free one run per calendar month.
 *
 * Returns match counts and real spend only, never a "you would have won $X".
 * Canadian lotto tiers above the fixed low prizes are pari-mutuel — the payout
 * for "4 of 6" depends on that draw's pool and how many others matched — and
 * historical prize breakdowns aren't scraped, so any dollar figure for
 * winnings would be invented. See CLAUDE.md.
 */
export async function POST(req: Request) {
  let body: { gameSlug?: string; numbers?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const game = GAMES.find((g) => g.slug === body.gameSlug);
  if (!game) return NextResponse.json({ ok: false, error: "Unknown game." }, { status: 400 });
  if (game.format === "digit") {
    return NextResponse.json(
      { ok: false, error: "Digit games don't use a number pool." },
      { status: 400 },
    );
  }

  const nums = Array.isArray(body.numbers) ? body.numbers : [];
  const valid =
    nums.length === game.pick &&
    nums.every((n) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= game.max) &&
    new Set(nums as number[]).size === game.pick;
  if (!valid) {
    return NextResponse.json(
      { ok: false, error: `Pick ${game.pick} different numbers from 1 to ${game.max}.` },
      { status: 400 },
    );
  }

  const subscriber = await getCurrentSubscriber();
  if (!subscriber) {
    return NextResponse.json(
      { ok: false, code: "SIGN_IN_REQUIRED", error: "Sign in to backtest a combination." },
      { status: 401 },
    );
  }

  const verdict = await consumeQuota(subscriber.id, "backtest");
  if (!verdict.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "QUOTA_EXHAUSTED",
        error: "You've used this month's free backtest. Lottizen Plus removes the limit.",
      },
      { status: 403 },
    );
  }

  const draws = getDraws(game.slug);
  if (!draws?.draws?.length) {
    return NextResponse.json({ ok: false, error: "No draw history for this game." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    game: { slug: game.slug, name: game.name, pick: game.pick, max: game.max },
    result: backtest(
      nums as number[],
      draws.draws.map((d) => ({ date: d.date, numbers: d.numbers })),
      game.price ?? null,
      game.currency,
    ),
    quota: {
      isPlus: verdict.isPlus,
      runsLeft: verdict.isPlus ? null : Math.max(0, (verdict.runsLeft ?? 1) - 1),
    },
  });
}

/** GET — quota state for rendering the UI, without consuming a run. */
export async function GET() {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) {
    return NextResponse.json({ ok: true, signedIn: false, isPlus: false, runsLeft: 0 });
  }
  const verdict = await checkQuota(subscriber.id, "backtest");
  return NextResponse.json({
    ok: true,
    signedIn: true,
    isPlus: verdict.isPlus,
    runsLeft: verdict.runsLeft,
  });
}
