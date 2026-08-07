import type { Metadata } from "next";
import Link from "next/link";
import { SITE, absUrl } from "@/lib/site";
import { JsonLd } from "@/components/site/JsonLd";

const RAPIDAPI_URL = "https://rapidapi.com/l3rundong/api/lottizen-data-api";

export const metadata: Metadata = {
  title: "Lottizen Data API — Canada, US & Europe Lottery Data (REST/JSON)",
  description:
    "A REST/JSON API for North American and European lottery data: winning numbers, 40+ years of draw history, hot/cold/overdue number statistics, and the only Ontario scratch-ticket remaining-prize tracker in Canada. Free tier on RapidAPI.",
  keywords: [
    "canada lottery api",
    "lottery data api",
    "lotto max api",
    "lottery numbers api",
    "ontario scratch ticket api",
    "lottery statistics api",
  ],
  alternates: { canonical: "/api" },
  openGraph: {
    title: "Lottizen Data API",
    description:
      "REST/JSON lottery data for Canada, the US and Europe — winning numbers, draw history, number statistics, and an exclusive Ontario scratch-ticket remaining-prize tracker.",
    url: absUrl("/api"),
    type: "website",
  },
};

const BASE = absUrl("/api/v1");

interface Endpoint {
  id: string;
  method: "GET";
  path: string;
  title: string;
  description: string;
  params?: { name: string; description: string }[];
  query?: { name: string; description: string }[];
  curl: string;
  response: string;
  exclusive?: boolean;
}

const ENDPOINTS: Endpoint[] = [
  {
    id: "get-games",
    method: "GET",
    path: "/games",
    title: "List all games",
    description:
      "Every live, data-backed draw-lottery game across Canada, the US and Europe — country, agency, number-pool rules, ticket price, and draw days.",
    curl: `curl "${BASE}/games"`,
    response: `{
  "data": [
    {
      "slug": "lotto-max",
      "name": "Lotto Max",
      "country": "CA",
      "countryName": "Canada",
      "agency": "National",
      "operator": "the Interprovincial Lottery Corporation",
      "region": "Canada-wide",
      "format": "lotto",
      "pick": 7,
      "max": 52,
      "hasBonus": true,
      "bonusLabel": "Bonus",
      "bonusMax": 52,
      "bonusCount": 1,
      "drawDays": ["Tuesday", "Friday"],
      "price": 6,
      "currency": "CAD",
      "blurb": "Canada's biggest jackpot game — pick 7 of 52, with jackpots to $90M plus Max Millions.",
      "progressive": true,
      "drawCount": 753,
      "dataSince": "2019-05-14"
    }
    // ... 18 more games (Lotto 6/49, Powerball, EuroMillions, UK Lotto, ...)
  ],
  "meta": { "total": 19 }
}`,
  },
  {
    id: "get-game",
    method: "GET",
    path: "/games/{slug}",
    title: "Get a single game",
    description: "Full details for one game, by slug (e.g. lotto-max, powerball, euromillions).",
    params: [{ name: "slug", description: "Game slug, as returned by GET /games." }],
    curl: `curl "${BASE}/games/lotto-max"`,
    response: `{
  "data": {
    "slug": "lotto-max",
    "name": "Lotto Max",
    "country": "CA",
    "countryName": "Canada",
    "agency": "National",
    "operator": "the Interprovincial Lottery Corporation",
    "region": "Canada-wide",
    "format": "lotto",
    "pick": 7,
    "max": 52,
    "hasBonus": true,
    "bonusLabel": "Bonus",
    "bonusMax": 52,
    "bonusCount": 1,
    "drawDays": ["Tuesday", "Friday"],
    "price": 6,
    "currency": "CAD",
    "blurb": "Canada's biggest jackpot game — pick 7 of 52, with jackpots to $90M plus Max Millions.",
    "progressive": true,
    "drawCount": 753,
    "dataSince": "2019-05-14"
  },
  "meta": null
}`,
  },
  {
    id: "get-latest",
    method: "GET",
    path: "/games/{slug}/latest",
    title: "Latest draw",
    description: "The most recent draw for a game, plus the next scheduled draw date and jackpot estimate where available.",
    params: [{ name: "slug", description: "Game slug." }],
    curl: `curl "${BASE}/games/lotto-max/latest"`,
    response: `{
  "data": {
    "slug": "lotto-max",
    "latestDate": "2026-08-04",
    "numbers": [1, 13, 24, 34, 46, 50, 51],
    "bonus": 36,
    "bonus2": null,
    "nextDraw": "2026-08-07",
    "nextJackpot": 25000000,
    "drawCount": 1255,
    "dataSince": "2009-09-25"
  },
  "meta": null
}`,
  },
  {
    id: "get-draws",
    method: "GET",
    path: "/games/{slug}/draws",
    title: "Draw history",
    description:
      "Historical draws, newest first. Some games go back over 40 years — Lotto 6/49 draw history starts 1982-06-12.",
    params: [{ name: "slug", description: "Game slug." }],
    query: [
      { name: "from", description: "Inclusive start date, YYYY-MM-DD." },
      { name: "to", description: "Inclusive end date, YYYY-MM-DD." },
      { name: "limit", description: "Results per page. Default 50, max 500." },
      { name: "offset", description: "Pagination offset. Default 0." },
    ],
    curl: `curl "${BASE}/games/lotto-max/draws?limit=2"`,
    response: `{
  "data": [
    { "date": "2026-08-04", "numbers": [1, 13, 24, 34, 46, 50, 51], "bonus": 36, "jackpot": null },
    { "date": "2026-07-31", "numbers": [3, 28, 32, 37, 40, 44, 47], "bonus": 23, "jackpot": null }
  ],
  "meta": {
    "game": "lotto-max",
    "from": null,
    "to": null,
    "limit": 2,
    "offset": 0,
    "total": 1255,
    "hasMore": true
  }
}`,
  },
  {
    id: "get-statistics",
    method: "GET",
    path: "/games/{slug}/statistics",
    title: "Number statistics",
    description:
      "Frequency, hot/cold classification, current & max gap (overdue tracking), common partner pairs, and aggregate breakdowns (odd/even, high/low, sum distribution) for a game's full number pool.",
    params: [{ name: "slug", description: "Game slug." }],
    curl: `curl "${BASE}/games/lotto-max/statistics"`,
    response: `{
  "data": {
    "game": "lotto-max",
    "dataSince": "2019-05-14",
    "drawCount": 753,
    "allTimeDrawCount": 1255,
    "pick": 7,
    "max": 52,
    "numbers": [
      {
        "n": 1,
        "count": 99,
        "frequency": 0.1315,
        "lastDate": "2026-08-04",
        "drawsAgo": 0,
        "currentGap": 0,
        "maxGap": 46,
        "hot": false,
        "cold": false,
        "partners": [{ "n": 45, "count": 20 }, { "n": 39, "count": 18 }, "..."]
      }
      // ... 51 more numbers
    ],
    "aggregate": {
      "hot": [6, 34, 3, 36, 32, 37],
      "cold": [20, 29, 26, 2, 45, 11],
      "topPairs": [{ "a": 22, "b": 46, "count": 29 }, "..."]
      // ... oddEven, highLow, sum, consecutive, frequencyChart, windowChart
    }
  },
  "meta": null
}`,
  },
  {
    id: "get-scratch-ontario",
    method: "GET",
    path: "/scratch/ontario",
    title: "Ontario scratch tickets — ranked",
    exclusive: true,
    description:
      "Every current OLG scratch ticket ranked by Value Score, with the full prize-tier breakdown and how many of each prize are still unclaimed. Lottizen is the only lottery API tracking remaining scratch-ticket prizes in Canada.",
    curl: `curl "${BASE}/scratch/ontario"`,
    response: `{
  "data": [
    {
      "slug": "poker-night",
      "name": "Poker Night",
      "gameNumber": "2535",
      "price": 10,
      "prizeTiers": [
        { "amount": 250000, "label": "$250,000.00", "total": 3, "remaining": 1, "isTop": true },
        { "amount": 10000, "label": "$10,000.00", "total": 1, "remaining": 0, "isTop": false }
        // ... 4 more tiers
      ],
      "topPrizeLabel": "$250,000.00",
      "topPrizesTotal": 3,
      "topPrizesRemaining": 1,
      "remainingPrizePool": 282150,
      "printedPrizePool": 952950,
      "valueRetention": 1.771,
      "valueScore": 109.8,
      "rank": 1
    }
    // ... 49 more games
  ],
  "meta": {
    "generatedAt": "2026-08-05T16:05:08+00:00",
    "source": "olg-live",
    "currency": "CAD",
    "province": "ON",
    "gameCount": 50
  }
}`,
  },
  {
    id: "get-scratch-ontario-slug",
    method: "GET",
    path: "/scratch/ontario/{slug}",
    title: "Ontario scratch ticket detail",
    exclusive: true,
    description: "Full prize-tier breakdown for a single OLG scratch ticket, by slug.",
    params: [{ name: "slug", description: "Scratch ticket slug, as returned by GET /scratch/ontario." }],
    curl: `curl "${BASE}/scratch/ontario/bingo-multip"`,
    response: `{
  "data": {
    "slug": "bingo-multip",
    "name": "Bingo Multip",
    "gameNumber": "3088",
    "price": 10,
    "prizeTiers": [
      { "amount": 250000, "label": "$250,000.00", "total": 5, "remaining": 4, "isTop": true },
      { "amount": 100000, "label": "$100,000.00", "total": 1, "remaining": 1, "isTop": false },
      { "amount": 50000, "label": "$50,000.00", "total": 1, "remaining": 1, "isTop": false }
      // ... 17 more tiers
    ],
    "topPrizeLabel": "$250,000.00",
    "topPrizesTotal": 5,
    "topPrizesRemaining": 4,
    "prizeTierCount": 20,
    "remainingPrizePool": 1598725,
    "printedPrizePool": 2002165,
    "valueRetention": 1.115,
    "valueScore": 69.1,
    "rank": 13
  },
  "meta": null
}`,
  },
];

const TOC: { id: string; text: string; level: 2 | 3 }[] = [
  { id: "overview", text: "Overview", level: 2 },
  { id: "authentication", text: "Authentication", level: 2 },
  { id: "response-format", text: "Response format", level: 2 },
  { id: "endpoints", text: "Endpoints", level: 2 },
  ...ENDPOINTS.map((e) => ({ id: e.id, text: `${e.method} ${e.path}`, level: 3 as const })),
  { id: "errors", text: "Errors", level: 2 },
  { id: "pricing", text: "Rate limits & pricing", level: 2 },
];

export default function ApiDocsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebAPI",
    name: "Lottizen Data API",
    description: metadata.description,
    url: absUrl("/api"),
    provider: { "@type": "Organization", name: SITE.name, url: SITE.url },
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <span>API</span>
          </div>
          <div className="section-eyebrow">Developer API</div>
          <h1 className="section-headline">
            Lottery data, <em>as JSON.</em>
          </h1>
          <p className="section-lede">
            REST/JSON access to Lottizen&rsquo;s Canada, US and Europe lottery data: winning
            numbers, 40+ years of draw history, hot/cold/overdue number statistics — and the only
            Ontario scratch-ticket remaining-prize tracker in Canada. Rebuilt daily.
          </p>
          <div className="hero-cta-row" style={{ marginTop: 8 }}>
            <a href={RAPIDAPI_URL} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              Get API Key on RapidAPI
            </a>
            <Link href="#endpoints" className="btn btn-secondary">
              Browse endpoints
            </Link>
          </div>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <div className="guide-layout">
            <aside className="guide-toc">
              <div className="guide-toc-title">On this page</div>
              <ol>
                {TOC.map((t) => (
                  <li key={t.id} className={`lvl-${t.level}`}>
                    <a href={`#${t.id}`}>{t.text}</a>
                  </li>
                ))}
              </ol>
            </aside>

            <div>
              <article className="prose guide-prose">
                <h2 id="overview">Overview</h2>
                <p>
                  The Lottizen Data API covers <strong>19 live draw-lottery games</strong> across
                  Canada, the US and Europe — Lotto Max, Lotto 6/49, Powerball, Mega Millions,
                  EuroMillions, EuroJackpot, UK Lotto and more — plus{" "}
                  <strong>50 Ontario (OLG) scratch tickets</strong>, ranked by remaining prize
                  value. Canada is our deepest market: every major national and regional draw game,
                  draw history back to 1982, and remaining-prize tracking on scratch tickets that
                  no other lottery API offers. All data refreshes daily from official sources.
                </p>
                <p>Base URL for every endpoint below:</p>
                <pre className="formula">{BASE}</pre>
                <p>
                  Coverage today: <strong>Canada</strong> (national + OLG/WCLC/BCLC/ALC), the{" "}
                  <strong>US</strong> (multi-state + New York), and <strong>Europe</strong>{" "}
                  (EuroMillions, EuroJackpot, UK Lotto). Japan is next — <strong>coming soon</strong>.
                </p>

                <h2 id="authentication">Authentication</h2>
                <p>
                  The API is distributed exclusively through{" "}
                  <a href={RAPIDAPI_URL} target="_blank" rel="noopener noreferrer">
                    RapidAPI
                  </a>
                  . Subscribe to a plan, and RapidAPI attaches your <code>X-RapidAPI-Key</code> to
                  every request automatically — there&rsquo;s no separate signup or key management
                  here. Rate limiting and billing are handled entirely by RapidAPI; see{" "}
                  <a href="#pricing">Rate limits &amp; pricing</a> below.
                </p>

                <h2 id="response-format">Response format</h2>
                <p>
                  Every endpoint returns JSON with a consistent envelope. Successful responses
                  carry the payload in <code>data</code> and any pagination/context info in{" "}
                  <code>meta</code>:
                </p>
                <pre className="formula">{`{ "data": ..., "meta": { ... } | null }`}</pre>
                <p>Errors use the same shape, with an HTTP status code that matches the problem:</p>
                <pre className="formula">{`{ "error": { "code": "GAME_NOT_FOUND", "message": "No live game found for slug 'foo'." } }`}</pre>
                <p>
                  Responses are cached at the edge for one hour (<code>Cache-Control:
                  public, s-maxage=3600</code>) — data changes at most once a day, so a fresh
                  request within that window returns the same result.
                </p>

                <h2 id="endpoints">Endpoints</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Method</th>
                        <th>Path</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ENDPOINTS.map((e) => (
                        <tr key={e.id}>
                          <td>{e.method}</td>
                          <td>
                            <a href={`#${e.id}`}>
                              <code>{e.path}</code>
                            </a>
                            {e.exclusive ? <span className="notice-tag" style={{ marginLeft: 8 }}>Exclusive</span> : null}
                          </td>
                          <td>{e.title}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {ENDPOINTS.map((e) => (
                  <div key={e.id}>
                    <h3 id={e.id}>
                      {e.method} {e.path}
                    </h3>
                    <p>{e.description}</p>
                    {e.params?.length ? (
                      <ul>
                        {e.params.map((p) => (
                          <li key={p.name}>
                            <code>{p.name}</code> — {p.description}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {e.query?.length ? (
                      <ul>
                        {e.query.map((p) => (
                          <li key={p.name}>
                            <code>?{p.name}</code> — {p.description}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <p>
                      <strong>Request</strong>
                    </p>
                    <pre className="formula">{e.curl}</pre>
                    <p>
                      <strong>Response</strong> <span style={{ color: "var(--ink-3)" }}>200 OK</span>
                    </p>
                    <pre className="formula">{e.response}</pre>
                  </div>
                ))}

                <h2 id="errors">Errors</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Code</th>
                        <th>Meaning</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>400</td>
                        <td>
                          <code>INVALID_PARAM</code>
                        </td>
                        <td>A query parameter is malformed (e.g. a non-date <code>from</code>/<code>to</code>).</td>
                      </tr>
                      <tr>
                        <td>401</td>
                        <td>
                          <code>UNAUTHORIZED</code>
                        </td>
                        <td>Missing or invalid RapidAPI credentials.</td>
                      </tr>
                      <tr>
                        <td>404</td>
                        <td>
                          <code>GAME_NOT_FOUND</code>
                        </td>
                        <td>No live game or scratch ticket matches the given slug.</td>
                      </tr>
                      <tr>
                        <td>404</td>
                        <td>
                          <code>DRAW_NOT_FOUND</code> / <code>STATS_NOT_FOUND</code>
                        </td>
                        <td>The game exists but has no draw or statistics data.</td>
                      </tr>
                      <tr>
                        <td>429</td>
                        <td>
                          <code>RATE_LIMIT_EXCEEDED</code>
                        </td>
                        <td>Plan quota exceeded — enforced by RapidAPI, see below.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <h2 id="pricing">Rate limits &amp; pricing</h2>
                <p>Plans and quotas are managed on RapidAPI:</p>
                <ul>
                  <li>
                    <strong>Basic</strong> — free, 25 requests/day.
                  </li>
                  <li>
                    <strong>Pro</strong> — $15/month, 5,000 requests/day.
                  </li>
                  <li>
                    <strong>Ultra</strong> — $49/month, 50,000 requests/day.
                  </li>
                </ul>
                <p>
                  <a href={RAPIDAPI_URL} target="_blank" rel="noopener noreferrer">
                    See current pricing and subscribe on RapidAPI →
                  </a>
                </p>
              </article>

              <div className="notice" style={{ marginTop: 32 }}>
                <span className="notice-tag">Independent</span>
                <span>
                  Lottizen is an independent data provider — not a lottery operator, and not
                  affiliated with OLG, WCLC, BCLC, ALC, MUSL, the NY Lottery, EuroMillions,
                  EuroJackpot, or Allwyn/The National Lottery. Data is collected from public
                  official sources; see <Link href="/methodology">methodology</Link>.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
