# RapidAPI listing — step-by-step

Everything referenced below lives in `docs/rapidapi/`:
`openapi.yaml`, `description.md`, `pricing.md`, `rapidapi-secret.md`.

## 0. Before you start

- [ ] Confirm the API is deployed and public (gate disabled) at
      `https://lottizen.com/api/v1/*` — run
      `python3 scripts/audit_site.py --api-health --site https://lottizen.com`
      and expect all checks `OK`.
- [ ] Have a RapidAPI provider account (rapidapi.com → sign up / log in as a
      **Provider**, not just a consumer).

## 1. Create the API

1. Go to **rapidapi.com/studio** (or the "My APIs" section of the provider
   dashboard) → **Add New API**.
2. Choose **Import from OpenAPI / Swagger file** (not "manually add
   endpoints" — this is exactly what `openapi.yaml` is for; it saves
   re-typing all 9 endpoints by hand).
3. Upload `docs/rapidapi/openapi.yaml`.
4. RapidAPI parses it and pre-fills:
   - API name → "Lottizen Data API" (from `info.title`)
   - Base URL → `https://lottizen.com/api/v1` (from `servers[0].url`)
   - All 9 endpoints, grouped by the `Games` / `Scratch` / `Scratch — Ontario`
     tags, with their parameters and example responses. `Scratch` covers the
     general `/scratch/{province}` routes (all 5 provinces); `Scratch —
     Ontario` is the pre-existing Ontario-only alias, kept for subscribers
     integrated before the other 4 provinces launched.
5. Review the imported endpoint list against the table in
   `description.md` — confirm all 9 are present and none show a parsing
   warning icon.

## 2. API details

On the API's **Info** / **Overview** tab:

- [ ] **Short description** — paste from `description.md` § "Short
      description."
- [ ] **Long description / Overview** — paste the Markdown block from
      `description.md` § "Long description."
- [ ] **Category** — "Data" or "Sports & Gaming" (RapidAPI's exact taxonomy
      varies; pick the closest to "lottery/gaming data").
- [ ] **Website** — `https://lottizen.com`
- [ ] **Terms of Service / Privacy Policy URL** — link to
      `https://lottizen.com/methodology` and `https://lottizen.com/responsible-play`
      if RapidAPI requires them (or add dedicated ToS/Privacy pages first if
      it's a hard requirement for your account tier — check the dashboard
      prompt).
- [ ] **Logo** — use the Lottizen logomark (see `components/site/Logo.tsx` /
      `app/icon.svg` for the source asset).
- [ ] **Tags/keywords** — `lottery`, `canada`, `powerball`, `euromillions`,
      `lotto`, `scratch ticket`, `lottery api`, `lottery data`.

## 3. Endpoints review

For each of the 9 imported endpoints:

- [ ] Confirm the example response shown matches what's in `openapi.yaml`
      (RapidAPI sometimes needs the example re-pasted manually if the import
      doesn't carry it — copy from the `example:` blocks in the spec, or
      from the live examples on https://lottizen.com/api).
- [ ] Confirm required path parameters (`slug`) are marked **required**.
- [ ] Confirm query parameters on `/games/{slug}/draws` (`from`, `to`,
      `limit`, `offset`) are marked **optional**.
- [ ] Use RapidAPI's **Test Endpoint** button on 2–3 endpoints (e.g.
      `/games`, `/games/lotto-max/statistics`, `/scratch/british-columbia`) to confirm
      RapidAPI can actually reach `lottizen.com` and gets a real `200` with a
      `data` payload. This is why the RapidAPI-secret gate must stay
      **disabled** at this point — see `rapidapi-secret.md`.

## 4. Pricing

On the **Pricing** tab, create three plans per `pricing.md`:

- [ ] **Basic** — Free, 25 requests/day, hard limit ON (no overage).
- [ ] **Pro** — $15/month, 5,000 requests/day.
- [ ] **Ultra** — $49/month, 50,000 requests/day.
- [ ] Leave overage billing off for all three plans initially (see
      `pricing.md` § Rationale).
- [ ] Optional: set a per-second burst rate limit (5 req/s Basic, 20 req/s
      Pro/Ultra) if the field is available.

## 5. Publish

- [ ] Switch visibility from **Draft** to **Public** (or submit for
      RapidAPI review, if your account requires it before public listing).
- [ ] Note the listing URL RapidAPI assigns — you'll need it for two
      follow-ups outside this checklist:
      1. Give it to Claude to replace the `RAPIDAPI_URL` placeholder in
         `app/api/page.tsx` (currently `"https://rapidapi.com/"`).
      2. Keep it for your own reference/marketing.

## 6. After the listing is live

- [ ] Follow `rapidapi-secret.md` to copy the generated Proxy Secret into
      Vercel env vars (`RAPIDAPI_PROXY_SECRET`, `API_REQUIRE_RAPIDAPI_SECRET=true`)
      and redeploy — this is what actually enforces RapidAPI's billing/quota
      by rejecting direct (non-proxied) traffic.
- [ ] Subscribe to your own **Basic** plan from a throwaway/test RapidAPI
      account (or the built-in test console) and confirm a real end-to-end
      request — key → RapidAPI proxy → lottizen.com → 200 response — works
      after the secret gate is on.
- [ ] Re-run `python3 scripts/audit_site.py --api-health --site
      https://lottizen.com` and expect the direct (non-proxied) checks to
      now fail with 401 — that's the expected, correct state once the gate
      is enabled (see `rapidapi-secret.md` step 5).
