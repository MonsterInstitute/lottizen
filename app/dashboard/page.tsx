import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentSubscriber } from "@/lib/auth";
import {
  getFollowedGames,
  getSubscription,
  listCombinations,
  listRecentChecks,
  listRecentEmailLog,
  listScratchFavourites,
} from "@/lib/supabase-admin";
import { effectiveTier } from "@/lib/entitlements";
import { getGame } from "@/config/games";
import { getLatestAll } from "@/lib/draws";
import { getGameBySlug } from "@/lib/data";
import { provinceForAgency } from "@/config/scratch";
import { SubscribeForm } from "@/components/site/SubscribeForm";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

// A personal, session-gated page — never indexed, always rendered fresh
// (never cached) since it shows one specific signed-in subscriber's data.
export const metadata: Metadata = {
  title: "My Lottizen",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

function SignInPrompt() {
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="section-eyebrow">My Lottizen</div>
          <h1 className="section-headline">
            Keep track of the games <em>you play.</em>
          </h1>
          <p className="section-lede">
            Enter your email to create a free account or sign back in — no password. Save your
            numbers, follow the games you play, and check results automatically after every draw.
          </p>
        </div>
      </div>
      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container" style={{ maxWidth: 560 }}>
          <div className="card" style={{ padding: 32 }}>
            <SubscribeForm title="Email address" buttonLabel="Continue" />
          </div>
          <p className="field-hint" style={{ marginTop: 20 }}>
            Lottizen is an independent research and tracking tool — not a lottery operator, and
            not financial or gambling advice. See{" "}
            <Link href="/responsible-play">responsible play</Link>.
          </p>
        </div>
      </section>
    </>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: { welcome?: string } }) {
  const subscriber = await getCurrentSubscriber();
  if (!subscriber) return <SignInPrompt />;

  const [followedSlugs, combinations, recentChecks, favouriteSlugs, alerts, subscription] = await Promise.all([
    getFollowedGames(subscriber.id),
    listCombinations(subscriber.id),
    listRecentChecks(subscriber.id, 8),
    listScratchFavourites(subscriber.id),
    listRecentEmailLog(subscriber.id, 8),
    getSubscription(subscriber.id),
  ]);
  const tier = effectiveTier(subscription);

  const followedGames = followedSlugs
    .map((slug) => {
      const cfg = getGame(slug);
      const latest = getLatestAll().find((l) => l.slug === slug) ?? null;
      return cfg ? { cfg, latest } : null;
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);

  const favouriteScratch = favouriteSlugs
    .map((f) => {
      const province = provinceForAgency(f.agency);
      return province ? getGameBySlug(province, f.slug) : undefined;
    })
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  return (
    <>
      <div className="page-head" style={{ paddingBottom: 24 }}>
        <div className="container">
          <div className="section-eyebrow">Signed in as {subscriber.email}</div>
          <h1 className="section-headline">
            My <em>Lottizen.</em>
          </h1>
          {searchParams.welcome === "1" ? (
            <p className="section-lede">
              You&rsquo;re all set — start by following a game or saving your numbers below.
            </p>
          ) : null}
        </div>
      </div>
      <section className="section" style={{ paddingTop: 8 }}>
        <div className="container">
          <DashboardClient
            tier={tier}
            frequency={subscriber.frequency}
            followedGames={followedGames}
            combinations={combinations}
            recentChecks={recentChecks}
            favouriteScratch={favouriteScratch}
            alerts={alerts}
          />
        </div>
      </section>
    </>
  );
}
