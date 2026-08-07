"use client";

import { useState, type FormEvent } from "react";
import type { PrefCountry } from "@/lib/subscribe";

interface SubscribeFormProps {
  /** Region hint from the page this form is embedded on (e.g. a Canada game
   *  page passes "CA") — only affects which games get pre-checked on the
   *  preferences page after confirming; the user can change it there. */
  defaultCountry?: PrefCountry;
  title?: string;
  description?: string;
}

export function SubscribeForm({ defaultCountry, title, description }: SubscribeFormProps) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "sent" | "already" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setState("submitting");
    setError(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, country: defaultCountry }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error || "Something went wrong. Try again shortly.");
        setState("error");
        return;
      }
      setState(body.status === "already_subscribed" ? "already" : "sent");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setState("error");
    }
  }

  if (state === "sent" || state === "already") {
    return (
      <div className="form-notice success">
        {state === "sent"
          ? "Check your inbox — click the confirmation link to start choosing which games to follow."
          : "You're already subscribed — check your inbox for a link to manage your preferences."}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="inline-form">
      <div className="field">
        {title ? <label htmlFor="subscribe-email">{title}</label> : null}
        <input
          id="subscribe-email"
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={state === "submitting"}
        />
        {description ? <span className="field-hint">{description}</span> : null}
      </div>
      <button type="submit" className="btn btn-primary" disabled={state === "submitting"}>
        {state === "submitting" ? "Sending…" : "Subscribe"}
      </button>
      {error ? <div className="form-notice error" style={{ width: "100%" }}>{error}</div> : null}
    </form>
  );
}
