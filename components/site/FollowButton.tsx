"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SubscribeForm } from "@/components/site/SubscribeForm";

interface FollowButtonProps {
  kind: "game" | "scratch";
  slug: string;
  /** Required for kind="scratch" — game_slug alone isn't unique across the
   * 5 tracked agencies (see scratch_favourites' composite key). */
  agency?: string;
  label: string;
}

/**
 * "Track this game" / "Follow this scratch ticket" — the contextual CTA the
 * product brief asks for on relevant pages. Signed-in: toggles the follow
 * state directly. Anonymous: explains why an account helps (brief's exact
 * framing) and reuses the existing SubscribeForm.
 *
 * Self-contained: fetches its own signed-in/following status on mount via
 * /api/account/status, rather than receiving it as server props — the pages
 * this lives on (/[country]/[game], /scratch/[province]/[slug]) are
 * statically generated, so there is no per-visitor state available at
 * render time.
 */
export function FollowButton({ kind, slug, agency, label }: FollowButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const path = kind === "game" ? "/api/account/games" : "/api/account/scratch-favourites";

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ kind, slug });
    if (agency) qs.set("agency", agency);
    fetch(`/api/account/status?${qs.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setIsSignedIn(Boolean(data.signedIn));
        setFollowing(Boolean(data.following));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [kind, slug, agency]);

  async function toggle() {
    if (!isSignedIn) {
      setShowPrompt(true);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(path, {
      method: following ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameSlug: slug, agency }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !data.ok) {
      setError(data.error || "Something went wrong.");
      return;
    }
    setFollowing(!following);
    router.refresh();
  }

  if (showPrompt) {
    return (
      <div className="card" style={{ padding: 20, maxWidth: 420 }}>
        <p style={{ marginBottom: 12, fontSize: 14.5 }}>
          Create a free account to save this and check it automatically after future draws.
        </p>
        <SubscribeForm buttonLabel="Continue" />
      </div>
    );
  }

  return (
    <div>
      <button className={following ? "btn btn-secondary" : "btn btn-primary"} disabled={busy || loading} onClick={toggle}>
        {loading ? label : following ? "Following ✓" : label}
      </button>
      {error ? <div className="form-notice error" style={{ marginTop: 8 }}>{error}</div> : null}
    </div>
  );
}
