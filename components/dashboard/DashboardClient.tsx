"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LIVE_GAMES, countrySlug, type GameConfig } from "@/config/games";
import type { LatestGame } from "@/lib/draws";
import type { Game as ScratchGame } from "@/lib/types";
import type { Combination, CombinationCheck, EmailLogRow } from "@/lib/supabase-admin";
import type { Tier } from "@/lib/entitlements";
import { Balls } from "@/components/draws/Balls";
import { formatCheckResult, CONFIRMATION_NOTE } from "@/lib/prize-language";
import { PLANS } from "@/lib/plans";

// Duplicated (not imported) from lib/subscribe.ts deliberately: that module
// also exports gamesByBucket()/subscribableGames(), which pull in
// lib/draws.ts's full RAW_DRAWS/RAW_STATS build-time data — fine in a server
// component, but importing any value from that module here would drag that
// entire dataset into this "use client" bundle. These three constants have
// no such dependency, so they're small enough to keep in sync by hand.
const FREQUENCIES = ["instant", "weekly", "both"] as const;
type Frequency = (typeof FREQUENCIES)[number];
const FREQUENCY_LABELS: Record<Frequency, string> = {
  instant: "Email me the moment a game I follow draws",
  weekly: "Sunday weekly digest only",
  both: "Both — instant results and the weekly digest",
};

interface DashboardClientProps {
  tier: Tier;
  trialEnd: string | null;
  frequency: string;
  followedGames: { cfg: GameConfig; latest: LatestGame | null }[];
  combinations: Combination[];
  recentChecks: CombinationCheck[];
  favouriteScratch: ScratchGame[];
  alerts: EmailLogRow[];
}

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok, status: res.status, data };
}

const ALERT_LABELS: Record<string, string> = {
  confirmation: "Welcome email",
  sign_in_link: "Sign-in link",
  manage_link: "Manage-subscription link",
  draw_result: "Draw-result email",
  weekly_digest: "Weekly digest",
};

export function DashboardClient({
  tier,
  trialEnd,
  frequency,
  followedGames,
  combinations,
  recentChecks,
  favouriteScratch,
  alerts,
}: DashboardClientProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const followedSlugs = new Set(followedGames.map((g) => g.cfg.slug));
  const availableToFollow = LIVE_GAMES.filter((g) => !followedSlugs.has(g.slug));
  const [addGameSlug, setAddGameSlug] = useState(availableToFollow[0]?.slug ?? "");

  const isPlus = tier === "plus";
  const gameLimit = isPlus ? Infinity : PLANS.free.limits.followedGames;
  const comboLimit = isPlus ? Infinity : PLANS.free.limits.savedCombinations;
  const trialDaysLeft =
    trialEnd != null ? Math.max(0, Math.ceil((new Date(trialEnd).getTime() - Date.now()) / 86400000)) : null;
  const atGameLimit = followedGames.length >= gameLimit;
  const atComboLimit = combinations.length >= comboLimit;

  async function run(key: string, fn: () => Promise<{ ok: boolean; data: any }>) {
    setBusy(key);
    setError(null);
    const result = await fn();
    setBusy(null);
    if (!result.ok) {
      setError(result.data?.error || "Something went wrong.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function upgrade(plan: "monthly" | "annual") {
    setBusy("upgrade");
    setError(null);
    const result = await api("/api/billing/checkout", "POST", { plan });
    setBusy(null);
    if (result.status === 501) {
      setError("Lottizen Plus subscriptions aren't open yet — check back soon.");
      return;
    }
    if (!result.ok) {
      setError(result.data?.error || "Couldn't start checkout.");
      return;
    }
    if (result.data?.url) window.location.href = result.data.url;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {error ? <div className="form-notice error">{error}</div> : null}

      {!isPlus ? (
        <div className="card" style={{ padding: 28, background: "var(--brand-soft)", border: "1px solid var(--brand)" }}>
          <div className="section-eyebrow">Free plan</div>
          <h2 className="section-headline" style={{ fontSize: "clamp(22px,2.6vw,28px)", marginBottom: 8 }}>
            Never buy an empty ticket with <em>Lottizen Plus.</em>
          </h2>
          <p className="section-lede" style={{ marginBottom: 16, fontSize: 15 }}>
            Alerts when a top prize is claimed, all 5 provinces (428 games), estimated real value
            per dollar, a budget optimizer, and unlimited saved number combinations. Try free for
            7 days.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-primary" disabled={busy === "upgrade"} onClick={() => upgrade("monthly")}>
              {PLANS.plus.priceMonthlyLabel} — Start free trial
            </button>
            <button className="btn btn-secondary" disabled={busy === "upgrade"} onClick={() => upgrade("annual")}>
              {PLANS.plus.priceAnnualLabel} ({PLANS.plus.annualSavingsLabel})
            </button>
          </div>
        </div>
      ) : (
        <div className="notice">
          <span className="notice-tag">Plus</span>
          <span>
            You&rsquo;re on Lottizen Plus — unlimited games, combinations, and the full scratch
            board.
            {trialDaysLeft !== null
              ? ` Trial ends in ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} — your card will then be charged.`
              : ""}
          </span>
          <button
            className="nav-signin"
            style={{ fontSize: 13, marginLeft: "auto" }}
            disabled={busy === "portal"}
            onClick={() =>
              run("portal", async () => {
                const result = await api("/api/billing/portal", "POST");
                if (result.ok && result.data?.url) window.location.href = result.data.url;
                return result;
              })
            }
          >
            Manage billing
          </button>
        </div>
      )}

      {/* ============ FOLLOWED GAMES ============ */}
      <div className="card" style={{ padding: 28 }}>
        <div className="section-eyebrow">Followed draw games</div>
        <h2 className="section-headline" style={{ fontSize: "clamp(20px,2.4vw,26px)", marginBottom: 14 }}>
          Games you&rsquo;re tracking
        </h2>
        {followedGames.length === 0 ? (
          <p className="field-hint">You&rsquo;re not following any games yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {followedGames.map(({ cfg, latest }) => (
              <div key={cfg.slug} className="data-card" style={{ boxShadow: "none" }}>
                <div className="data-card-head">
                  <Link href={`/${countrySlug(cfg.country)}/${cfg.slug}`} className="data-card-title">
                    {cfg.name}
                  </Link>
                  <button
                    className="nav-signin"
                    style={{ fontSize: 13 }}
                    disabled={busy === `unfollow-${cfg.slug}`}
                    onClick={() => run(`unfollow-${cfg.slug}`, () => api("/api/account/games", "DELETE", { gameSlug: cfg.slug }))}
                  >
                    Remove
                  </button>
                </div>
                <div className="field-hint" style={{ marginBottom: 8 }}>
                  {cfg.agency} · {cfg.region} · {cfg.currency} {cfg.price}
                </div>
                {latest ? (
                  <>
                    <Balls numbers={latest.numbers} bonus={latest.bonus} bonus2={latest.bonus2} size="sm" />
                    <div className="data-row">
                      <span className="k">Latest draw</span>
                      <span className="v">{latest.latestDate}</span>
                    </div>
                    <div className="data-row">
                      <span className="k">Next draw</span>
                      <span className="v">{latest.nextDraw ?? "—"}</span>
                    </div>
                    {cfg.progressive && latest.nextJackpot ? (
                      <div className="data-row">
                        <span className="k">Est. jackpot</span>
                        <span className="v">{cfg.currency} {latest.nextJackpot.toLocaleString()}</span>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="field-hint">Prize result requires confirmation with the official lottery operator — no draw data on file yet.</p>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {availableToFollow.length > 0 && !atGameLimit ? (
            <>
              <select value={addGameSlug} onChange={(e) => setAddGameSlug(e.target.value)} style={{ maxWidth: 260 }}>
                {availableToFollow.map((g) => (
                  <option key={g.slug} value={g.slug}>
                    {g.name}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-secondary"
                disabled={!addGameSlug || busy === "follow"}
                onClick={() => run("follow", () => api("/api/account/games", "POST", { gameSlug: addGameSlug }))}
              >
                Track this game
              </button>
            </>
          ) : atGameLimit ? (
            <span className="field-hint">
              Free plan follows up to {PLANS.free.limits.followedGames} games. Upgrade to Lottizen Plus to follow more.
            </span>
          ) : null}
        </div>
      </div>

      {/* ============ SAVED COMBINATIONS ============ */}
      <CombinationsSection
        combinations={combinations}
        followedGames={followedGames.map((g) => g.cfg)}
        atLimit={atComboLimit}
        limit={comboLimit}
        onChanged={() => router.refresh()}
      />

      {/* ============ RECENTLY CHECKED RESULTS ============ */}
      <div className="card" style={{ padding: 28 }}>
        <div className="section-eyebrow">Recently checked results</div>
        <h2 className="section-headline" style={{ fontSize: "clamp(20px,2.4vw,26px)", marginBottom: 14 }}>
          Your latest checks
        </h2>
        {recentChecks.length === 0 ? (
          <p className="field-hint">
            Nothing checked yet — save a number combination above and we&rsquo;ll check it automatically after
            the next draw.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recentChecks.map((c) => {
              const { summary, needsConfirmation } = formatCheckResult(c.matched_main, c.pick, c.bonus_matched);
              const gameCfg = LIVE_GAMES.find((g) => g.slug === c.game_slug);
              return (
                <div key={c.id} className="data-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                  <span className="k">
                    {gameCfg?.name ?? c.game_slug} — {c.draw_date}
                  </span>
                  <span className="v" style={{ fontSize: 14 }}>{summary}</span>
                  {needsConfirmation ? <span className="field-hint">{CONFIRMATION_NOTE}</span> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============ FAVOURITE SCRATCH TICKETS ============ */}
      <div className="card" style={{ padding: 28 }}>
        <div className="section-eyebrow">Favourite scratch tickets</div>
        <h2 className="section-headline" style={{ fontSize: "clamp(20px,2.4vw,26px)", marginBottom: 14 }}>
          Tickets you&rsquo;re watching
        </h2>
        {favouriteScratch.length === 0 ? (
          <p className="field-hint">
            No favourites yet — browse the <Link href="/scratch">scratch value board</Link> and follow a ticket.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {favouriteScratch.map((g) => (
              <div key={`${g.agency}:${g.slug}`} className="data-row">
                <span className="k">
                  <Link href={`/scratch/${g.province}/${g.slug}`}>{g.name}</Link> · {g.agency} · ${Math.round(g.price)} · rank #{g.rank}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="v">Score {g.valueScore.toFixed(1)}</span>
                  <button
                    className="nav-signin"
                    style={{ fontSize: 13 }}
                    disabled={busy === `unfav-${g.agency}-${g.slug}`}
                    onClick={() =>
                      run(`unfav-${g.agency}-${g.slug}`, () =>
                        api("/api/account/scratch-favourites", "DELETE", { gameSlug: g.slug, agency: g.agency }),
                      )
                    }
                  >
                    Remove
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ============ LATEST ALERTS ============ */}
      <div className="card" style={{ padding: 28 }}>
        <div className="section-eyebrow">Latest relevant alerts</div>
        <h2 className="section-headline" style={{ fontSize: "clamp(20px,2.4vw,26px)", marginBottom: 14 }}>
          Emails sent to you
        </h2>
        {alerts.length === 0 ? (
          <p className="field-hint">No alerts sent yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {alerts.map((a) => (
              <div key={a.id} className="data-row">
                <span className="k">
                  {ALERT_LABELS[a.type] ?? a.type}
                  {a.game_slug ? ` — ${LIVE_GAMES.find((g) => g.slug === a.game_slug)?.name ?? a.game_slug}` : ""}
                </span>
                <span className="v" style={{ fontSize: 13 }}>{new Date(a.sent_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ============ PREFERENCES ============ */}
      <div className="card" style={{ padding: 28 }}>
        <div className="section-eyebrow">Notification preferences</div>
        <h2 className="section-headline" style={{ fontSize: "clamp(20px,2.4vw,26px)", marginBottom: 14 }}>
          How often should we email you?
        </h2>
        {FREQUENCIES.map((f) => (
          <label key={f} className="radio-item" style={{ marginBottom: 6 }}>
            <input
              type="radio"
              name="dashboard-frequency"
              checked={frequency === f}
              disabled={busy === "frequency"}
              onChange={() => run("frequency", () => api("/api/account/preferences", "POST", { frequency: f }))}
            />
            {FREQUENCY_LABELS[f as Frequency]}
          </label>
        ))}
      </div>

      {/* ============ ACCOUNT MANAGEMENT ============ */}
      <div className="card" style={{ padding: 28 }}>
        <div className="section-eyebrow">Your account</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <button
            className="btn btn-secondary"
            onClick={async () => {
              await api("/api/auth/logout", "POST");
              router.push("/");
              router.refresh();
            }}
          >
            Sign out
          </button>
          <button
            className="btn btn-secondary"
            disabled={busy === "clear"}
            onClick={() => {
              if (!window.confirm("Remove all your followed games, saved combinations, and favourites? Your account stays active.")) return;
              run("clear", () => api("/api/account/delete-data", "POST"));
            }}
          >
            Clear my saved data
          </button>
          <button
            className="btn btn-secondary"
            style={{ color: "#9a3a2a", borderColor: "#e0b3a8" }}
            disabled={busy === "delete"}
            onClick={async () => {
              if (!window.confirm("Permanently delete your Lottizen account and all saved data? This can't be undone.")) return;
              const result = await api("/api/account/delete-account", "POST");
              if (result.ok) {
                router.push("/");
                router.refresh();
              } else {
                setError(result.data?.error || "Couldn't delete your account.");
              }
            }}
          >
            Delete my account
          </button>
        </div>
        <p className="field-hint" style={{ marginTop: 16 }}>
          Lottizen is an independent research and tracking tool, not financial or gambling advice.{" "}
          <Link href="/responsible-play">Responsible play resources</Link>.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function CombinationsSection({
  combinations,
  followedGames,
  atLimit,
  limit,
  onChanged,
}: {
  combinations: Combination[];
  followedGames: GameConfig[];
  atLimit: boolean;
  limit: number;
  onChanged: () => void;
}) {
  const candidateGames = followedGames.length ? followedGames : LIVE_GAMES;
  const [gameSlug, setGameSlug] = useState(candidateGames[0]?.slug ?? "");
  const [numbersInput, setNumbersInput] = useState("");
  const [label, setLabel] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedGame = useMemo(() => candidateGames.find((g) => g.slug === gameSlug) ?? candidateGames[0], [gameSlug, candidateGames]);

  async function save() {
    setBusy(true);
    setFormError(null);
    const parsed = numbersInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number);
    if (parsed.some((n) => !Number.isFinite(n))) {
      setFormError("Numbers must be numbers, comma-separated.");
      setBusy(false);
      return;
    }
    const path = editingId ? `/api/account/combinations/${editingId}` : "/api/account/combinations";
    const method = editingId ? "PATCH" : "POST";
    const body = editingId ? { numbers: parsed, label } : { gameSlug, numbers: parsed, label };
    const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !data.ok) {
      setFormError(data.error || "Couldn't save.");
      return;
    }
    setNumbersInput("");
    setLabel("");
    setEditingId(null);
    onChanged();
  }

  function startEdit(c: Combination) {
    setEditingId(c.id);
    setGameSlug(c.game_slug);
    setNumbersInput(c.numbers.join(", "));
    setLabel(c.label ?? "");
    setFormError(null);
  }

  async function remove(id: number) {
    setBusy(true);
    await fetch(`/api/account/combinations/${id}`, { method: "DELETE" });
    setBusy(false);
    onChanged();
  }

  return (
    <div className="card" style={{ padding: 28 }}>
      <div className="section-eyebrow">Saved number combinations</div>
      <h2 className="section-headline" style={{ fontSize: "clamp(20px,2.4vw,26px)", marginBottom: 14 }}>
        Your numbers
      </h2>

      {combinations.length === 0 ? (
        <p className="field-hint">No saved combinations yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
          {combinations.map((c) => {
            const cfg = LIVE_GAMES.find((g) => g.slug === c.game_slug);
            return (
              <div key={c.id} className="data-card" style={{ boxShadow: "none" }}>
                <div className="data-card-head">
                  <span className="data-card-title">{cfg?.name ?? c.game_slug}</span>
                  <span style={{ display: "flex", gap: 10 }}>
                    <button className="nav-signin" style={{ fontSize: 13 }} onClick={() => startEdit(c)}>
                      Edit
                    </button>
                    <button className="nav-signin" style={{ fontSize: 13 }} disabled={busy} onClick={() => remove(c.id)}>
                      Delete
                    </button>
                  </span>
                </div>
                <Balls numbers={c.numbers} size="sm" />
                {c.label ? <div className="field-hint" style={{ marginTop: 6 }}>{c.label}</div> : null}
              </div>
            );
          })}
        </div>
      )}

      {atLimit && editingId === null ? (
        <p className="field-hint">
          Free plan saves {limit} number combination. Upgrade to Lottizen Plus to save more.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
          {!editingId ? (
            <div className="field">
              <label>Game</label>
              <select value={gameSlug} onChange={(e) => setGameSlug(e.target.value)}>
                {candidateGames.map((g) => (
                  <option key={g.slug} value={g.slug}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="field">
            <label>Numbers (comma-separated)</label>
            <input
              type="text"
              placeholder={selectedGame ? `e.g. ${Array.from({ length: selectedGame.pick }, (_, i) => i + 1).join(", ")}` : ""}
              value={numbersInput}
              onChange={(e) => setNumbersInput(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Label (optional)</label>
            <input type="text" placeholder="e.g. Birthday numbers" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" disabled={busy} onClick={save}>
              {editingId ? "Save changes" : "Save your numbers"}
            </button>
            {editingId ? (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setEditingId(null);
                  setNumbersInput("");
                  setLabel("");
                  setFormError(null);
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
          {formError ? <div className="form-notice error">{formError}</div> : null}
        </div>
      )}
    </div>
  );
}
