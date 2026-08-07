"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  DEFAULT_GAMES,
  FREQUENCIES,
  FREQUENCY_LABELS,
  PREF_COUNTRIES,
  gamesByBucket,
  type Frequency,
  type PrefCountry,
} from "@/lib/subscribe";

interface PrefsResponse {
  ok: boolean;
  error?: string;
  email?: string;
  country?: PrefCountry;
  frequency?: Frequency;
  games?: string[];
  savedNumbers?: { game_slug: string; numbers: number[]; label: string | null } | null;
}

function LoadingShell() {
  return (
    <div className="container" style={{ maxWidth: 640, padding: "60px 16px" }}>
      <p className="section-lede">Loading your preferences…</p>
    </div>
  );
}

function PreferencesInner() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const justConfirmed = params.get("confirmed") === "1";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState<PrefCountry>("CA");
  const [frequency, setFrequency] = useState<Frequency>("both");
  const [games, setGames] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [numbersGame, setNumbersGame] = useState<string>("");
  const [numbersInput, setNumbersInput] = useState("");
  const [numbersLabel, setNumbersLabel] = useState("");
  const [numbersState, setNumbersState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [numbersError, setNumbersError] = useState<string | null>(null);
  const [hasSavedNumbers, setHasSavedNumbers] = useState(false);

  const groups = gamesByBucket();

  useEffect(() => {
    if (!token) {
      setLoadError("Missing link token.");
      setLoading(false);
      return;
    }
    fetch(`/api/subscribe/preferences?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((body: PrefsResponse) => {
        if (!body.ok) {
          setLoadError(body.error || "This link is invalid or has expired.");
          setLoading(false);
          return;
        }
        setEmail(body.email || "");
        const c = body.country || "CA";
        setCountry(c);
        setFrequency(body.frequency || "both");
        const existing = body.games || [];
        setGames(new Set(existing.length ? existing : DEFAULT_GAMES[c]));
        if (body.savedNumbers) {
          setNumbersGame(body.savedNumbers.game_slug);
          setNumbersInput(body.savedNumbers.numbers.join(", "));
          setNumbersLabel(body.savedNumbers.label || "");
          setHasSavedNumbers(true);
        } else if (existing.length) {
          setNumbersGame(existing[0]);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoadError("Couldn't reach the server. Try again shortly.");
        setLoading(false);
      });
  }, [token]);

  function toggleGame(slug: string) {
    setGames((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function savePreferences() {
    setSaveState("saving");
    setSaveError(null);
    try {
      const res = await fetch("/api/subscribe/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, country, frequency, games: [...games] }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setSaveError(body.error || "Couldn't save. Try again shortly.");
        setSaveState("error");
        return;
      }
      setSaveState("saved");
    } catch {
      setSaveError("Couldn't reach the server. Try again shortly.");
      setSaveState("error");
    }
  }

  async function saveNumbers() {
    setNumbersState("saving");
    setNumbersError(null);
    const parsed = numbersInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number);
    if (parsed.some((n) => !Number.isFinite(n))) {
      setNumbersError("Numbers must be, well, numbers — comma-separated.");
      setNumbersState("error");
      return;
    }
    try {
      const res = await fetch("/api/subscribe/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, gameSlug: numbersGame, numbers: parsed, label: numbersLabel }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setNumbersError(body.error || "Couldn't save. Try again shortly.");
        setNumbersState("error");
        return;
      }
      setNumbersState("saved");
      setHasSavedNumbers(true);
    } catch {
      setNumbersError("Couldn't reach the server. Try again shortly.");
      setNumbersState("error");
    }
  }

  async function clearNumbers() {
    setNumbersState("saving");
    try {
      await fetch("/api/subscribe/numbers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setNumbersInput("");
      setNumbersLabel("");
      setHasSavedNumbers(false);
      setNumbersState("idle");
    } catch {
      setNumbersState("error");
    }
  }

  if (loading) return <LoadingShell />;

  if (loadError) {
    return (
      <div className="container" style={{ maxWidth: 640, padding: "60px 16px" }}>
        <div className="form-notice error">{loadError}</div>
        <p style={{ marginTop: 20 }}>
          <Link href="/subscribe" className="btn btn-secondary">
            Subscribe again
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 640, padding: "48px 16px 80px" }}>
      {justConfirmed ? (
        <div className="form-notice success" style={{ marginBottom: 24 }}>
          You&rsquo;re confirmed! Choose what to follow below.
        </div>
      ) : null}

      <p className="field-hint" style={{ marginBottom: 20 }}>
        Managing preferences for <strong style={{ color: "var(--ink)" }}>{email}</strong>
      </p>

      <div className="card" style={{ padding: 28, marginBottom: 24 }}>
        <div className="field-group-title" style={{ marginTop: 0 }}>
          Primary region
        </div>
        <div className="field">
          <select value={country} onChange={(e) => setCountry(e.target.value as PrefCountry)}>
            {PREF_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="field-hint">Just controls which games are pre-checked below.</span>
        </div>

        <div className="field-group-title">Follow these games</div>
        {(["CA", "US", "EU", "UK"] as const).map((bucket) =>
          groups[bucket].length ? (
            <div key={bucket} style={{ marginBottom: 14 }}>
              <div className="field-hint" style={{ marginBottom: 6, fontWeight: 600 }}>
                {PREF_COUNTRIES.find((c) => c.code === bucket)?.label}
              </div>
              <div className="checkbox-grid">
                {groups[bucket].map((g) => (
                  <label key={g.slug} className="checkbox-item">
                    <input type="checkbox" checked={games.has(g.slug)} onChange={() => toggleGame(g.slug)} />
                    {g.name}
                  </label>
                ))}
              </div>
            </div>
          ) : null,
        )}

        <div className="field-group-title">How often</div>
        {FREQUENCIES.map((f) => (
          <label key={f} className="radio-item" style={{ marginBottom: 6 }}>
            <input type="radio" name="frequency" checked={frequency === f} onChange={() => setFrequency(f)} />
            {FREQUENCY_LABELS[f]}
          </label>
        ))}

        <div style={{ marginTop: 20 }}>
          <button className="btn btn-primary" onClick={savePreferences} disabled={saveState === "saving"}>
            {saveState === "saving" ? "Saving…" : "Save preferences"}
          </button>
          {saveState === "saved" ? (
            <span style={{ marginLeft: 12, color: "var(--green-ink)", fontSize: 14 }}>Saved.</span>
          ) : null}
        </div>
        {saveError ? <div className="form-notice error">{saveError}</div> : null}
      </div>

      <div className="card" style={{ padding: 28, marginBottom: 24 }}>
        <div className="field-group-title" style={{ marginTop: 0 }}>
          Track your numbers (free: 1 set)
        </div>
        <p className="field-hint" style={{ marginBottom: 14 }}>
          We&rsquo;ll check these against every new draw of the game you pick and tell you how many
          matched.
        </p>
        <div className="field">
          <label>Game</label>
          <select value={numbersGame} onChange={(e) => setNumbersGame(e.target.value)}>
            {[...games].length === 0 ? <option value="">Follow a game above first</option> : null}
            {[...games].map((slug) => {
              const all = [...groups.CA, ...groups.US, ...groups.EU, ...groups.UK];
              const name = all.find((g) => g.slug === slug)?.name || slug;
              return (
                <option key={slug} value={slug}>
                  {name}
                </option>
              );
            })}
          </select>
        </div>
        <div className="field">
          <label>Your numbers (comma-separated)</label>
          <input
            type="text"
            placeholder="e.g. 7, 14, 21, 28, 35, 42"
            value={numbersInput}
            onChange={(e) => setNumbersInput(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Label (optional)</label>
          <input
            type="text"
            placeholder="e.g. Birthday numbers"
            value={numbersLabel}
            onChange={(e) => setNumbersLabel(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={saveNumbers} disabled={!numbersGame || numbersState === "saving"}>
          {numbersState === "saving" ? "Saving…" : "Save numbers"}
        </button>
        {hasSavedNumbers ? (
          <button
            className="btn btn-secondary"
            style={{ marginLeft: 10 }}
            onClick={clearNumbers}
            disabled={numbersState === "saving"}
          >
            Clear
          </button>
        ) : null}
        {numbersState === "saved" ? (
          <span style={{ marginLeft: 12, color: "var(--green-ink)", fontSize: 14 }}>Saved.</span>
        ) : null}
        {numbersError ? <div className="form-notice error">{numbersError}</div> : null}
      </div>

      <p className="field-hint">
        <Link href={`/api/subscribe/unsubscribe?token=${encodeURIComponent(token)}`}>Unsubscribe from all emails</Link>
      </p>
    </div>
  );
}

export function PreferencesClient() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <PreferencesInner />
    </Suspense>
  );
}
