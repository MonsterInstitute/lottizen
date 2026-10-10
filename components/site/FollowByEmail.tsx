"use client";

import { useEffect, useState, type FormEvent } from "react";

interface Props {
  /** What to follow: a charity lottery id, a scratch game slug (+ agency) or a draw game slug. */
  kind: "charity" | "scratch" | "game" | "province";
  id: string;
  agency?: string;
  /** 2-letter province the page is about, recorded as the signup source. */
  province?: string;
  title: string;
  /** What the emails will say, e.g. "3 days before each deadline and when the winners are drawn." */
  what: string;
}

/** The targeted signup on pages people come to for one thing: just an
 *  email, and it follows exactly that thing. A signed-in visitor gets a
 *  one-click follow instead. */
export function FollowByEmail({ kind, id, agency, province, title, what }: Props) {
  const [email, setEmail] = useState("");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "sent" | "following" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (kind === "province") {
      fetch(`/api/account/status?kind=game&slug=_`)
        .then((r) => r.json())
        .then((d) => setSignedIn(Boolean(d.signedIn)))
        .catch(() => setSignedIn(false));
      return;
    }
    const qs = new URLSearchParams({ kind, slug: id });
    if (agency) qs.set("agency", agency);
    fetch(`/api/account/status?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        setSignedIn(Boolean(d.signedIn));
        if (d.following) setState("following");
      })
      .catch(() => setSignedIn(false));
  }, [kind, id, agency]);

  async function followSignedIn() {
    setState("busy");
    const path = kind === "charity" ? "/api/account/charity" : kind === "game" ? "/api/account/games" : "/api/account/scratch-favourites";
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kind === "charity" ? { lotteryId: id } : { gameSlug: id, agency }),
    });
    setState(res.ok ? "following" : "error");
    if (!res.ok) setError("Couldn't follow right now. Try again shortly.");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          country: "CA",
          source: window.location.pathname,
          sourceProvince: province,
          follow: { kind, id, agency },
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "Something went wrong. Try again shortly.");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("error");
    }
  }

  return (
    <div className="follow-email card">
      <div className="follow-email-title">{title}</div>
      <p className="field-hint" style={{ margin: "4px 0 10px" }}>
        {what} Free.
      </p>
      {state === "following" ? (
        <div className="form-notice success">You&rsquo;re following this. We&rsquo;ll email you.</div>
      ) : state === "sent" ? (
        <div className="form-notice success">Check your inbox and click the link to confirm. Then you&rsquo;re set.</div>
      ) : signedIn && kind === "province" ? (
        <a className="btn btn-secondary" href="/dashboard">
          Set your province in My Lottizen
        </a>
      ) : signedIn ? (
        <button className="btn btn-primary" onClick={followSignedIn} disabled={state === "busy"}>
          Follow
        </button>
      ) : (
        <form onSubmit={onSubmit} className="follow-email-form">
          <input
            type="email"
            required
            placeholder="you@example.com"
            aria-label="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={state === "busy"}
          />
          <button className="btn btn-primary" type="submit" disabled={state === "busy"}>
            Notify me
          </button>
        </form>
      )}
      {error ? <div className="form-notice" style={{ marginTop: 8 }}>{error}</div> : null}
    </div>
  );
}
