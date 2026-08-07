"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: "That link is missing its token — try subscribing again below.",
  invalid_token: "That link is invalid or has expired — try subscribing again below.",
  server_error: "Something went wrong on our end — try again in a moment.",
};

function Inner() {
  const params = useSearchParams();
  const error = params.get("error");
  const message = error ? ERROR_MESSAGES[error] : null;
  if (!message) return null;
  return (
    <div className="form-notice error" style={{ marginBottom: 20 }}>
      {message}
    </div>
  );
}

/** Reads ?error= client-side so /subscribe itself stays a static page
 *  (a server component reading `searchParams` would force it dynamic). */
export function SubscribeErrorBanner() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
