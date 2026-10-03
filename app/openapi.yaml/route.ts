import { readFileSync } from "node:fs";
import path from "node:path";

// The API's OpenAPI spec at a stable public URL (https://lottizen.com/openapi.yaml),
// for API directories such as APIs.guru that poll a hosted spec. Served from
// docs/rapidapi/openapi.yaml — the same file the RapidAPI listing uses — so the
// two can't drift. Prerendered at build time.
export const dynamic = "force-static";

export function GET() {
  const spec = readFileSync(path.join(process.cwd(), "docs/rapidapi/openapi.yaml"), "utf8");
  return new Response(spec, {
    headers: { "Content-Type": "application/yaml; charset=utf-8", "Access-Control-Allow-Origin": "*" },
  });
}
