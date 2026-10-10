import { NextResponse } from "next/server";
import { getFollowedGames, getNumbers, getSubscriberByToken, updatePreferences } from "@/lib/supabase-admin";
import { isValidCountry, isValidFrequency, isValidGameSlug, isValidProvince } from "@/lib/subscribe";

/** GET /api/subscribe/preferences?token= — current state for the preferences page to render. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!token) return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });

  const subscriber = await getSubscriberByToken(token);
  if (!subscriber) return NextResponse.json({ ok: false, error: "Invalid or expired link." }, { status: 404 });

  const [games, numbers] = await Promise.all([getFollowedGames(subscriber.id), getNumbers(subscriber.id)]);
  return NextResponse.json({
    ok: true,
    email: subscriber.email,
    country: subscriber.country,
    province: subscriber.province,
    frequency: subscriber.frequency,
    confirmed: Boolean(subscriber.confirmed_at),
    unsubscribed: Boolean(subscriber.unsubscribed_at),
    games,
    savedNumbers: numbers[0] ?? null,
  });
}

/** POST /api/subscribe/preferences — save country / province / frequency / followed games. */
export async function POST(req: Request) {
  let body: { token?: string; country?: string; province?: string | null; frequency?: string; games?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const token = body.token || "";
  if (!token) return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });

  const subscriber = await getSubscriberByToken(token);
  if (!subscriber) return NextResponse.json({ ok: false, error: "Invalid or expired link." }, { status: 404 });

  const country = body.country && isValidCountry(body.country) ? body.country : subscriber.country;
  const frequency = body.frequency && isValidFrequency(body.frequency) ? body.frequency : subscriber.frequency;
  // "" / null clears it; an unknown value leaves it as it was.
  const province =
    body.province === undefined ? subscriber.province : body.province && isValidProvince(body.province) ? body.province : body.province ? subscriber.province : null;
  const games = Array.isArray(body.games) ? body.games.filter(isValidGameSlug) : [];

  try {
    await updatePreferences(subscriber.id, { country, province, frequency, games });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[subscribe/preferences] error:", e);
    return NextResponse.json({ ok: false, error: "Couldn't save. Try again shortly." }, { status: 500 });
  }
}
