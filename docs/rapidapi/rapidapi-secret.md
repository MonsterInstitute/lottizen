# RapidAPI proxy secret — how the gate works and how to turn it on

## What's already built

Every `/api/v1/*` route calls `checkRapidApiSecret(req)` first
(`lib/api.ts`). Today it's a no-op: the gate only activates when the env var
`API_REQUIRE_RAPIDAPI_SECRET` is exactly the string `"true"`. Until then,
every endpoint is publicly reachable with no key at all — deliberately, so
the API stays testable (RapidAPI's dashboard "Test Endpoint" tool, your own
curl checks, this repo's `scripts/audit_site.py --api-health`) while you're
setting up and reviewing the listing.

```ts
// lib/api.ts
export function checkRapidApiSecret(req: Request): NextResponse | null {
  if (process.env.API_REQUIRE_RAPIDAPI_SECRET !== "true") return null;
  const expected = process.env.RAPIDAPI_PROXY_SECRET;
  const got = req.headers.get("x-rapidapi-proxy-secret");
  if (!expected || got !== expected) {
    return apiError(401, "UNAUTHORIZED", /* ... */);
  }
  return null;
}
```

When enabled, it checks the `X-RapidAPI-Proxy-Secret` header — a value
RapidAPI's proxy attaches to every request it forwards to your backend after
a subscriber calls the API through RapidAPI. A request that reaches
lottizen.com *without* that header (or with the wrong value) did not come
through RapidAPI, so it's rejected with `401 UNAUTHORIZED`. This is what
stops people from bypassing RapidAPI's billing/quota by hitting
`lottizen.com/api/v1/...` directly once the listing is live.

## Turning it on, after the listing is approved

1. In the RapidAPI dashboard, open the listing → **Endpoints** (or
   **Security**) tab and copy the **Proxy Secret** value RapidAPI generates
   for this API.
2. Set two environment variables in Vercel (Project Settings → Environment
   Variables), **Production** scope:
   - `RAPIDAPI_PROXY_SECRET` = the value copied in step 1
   - `API_REQUIRE_RAPIDAPI_SECRET` = `true`
3. Redeploy (or trigger a new deployment — env var changes require one).
4. Verify: `curl -i https://lottizen.com/api/v1/games` (no header) should
   now return `401`; a request proxied through RapidAPI should return `200`.
5. Re-run `python3 scripts/audit_site.py --api-health --site
   https://lottizen.com` — expect this to now show failures for the direct
   (non-proxied) checks, since that script doesn't send the RapidAPI header
   by design. That's expected once the gate is on; at that point endpoint
   health is better verified from RapidAPI's own dashboard test console, or
   by adding `--header "X-RapidAPI-Proxy-Secret: <secret>"` support to the
   script if ongoing external monitoring is still wanted.

## Why not enable it from day one

Until the listing is approved and live, there's no RapidAPI proxy sending
that header — turning the gate on early would just 401 every request,
including RapidAPI's own review/testing traffic. Flip it on right after
go-live, not before.
