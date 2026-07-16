// Vercel build prefetch: materialize the site JSON from Supabase to data/ so
// `next build` can import it. Runs BEFORE gen_data_index.mjs (see package.json
// prebuild). Pure Node, no Python on the Vercel build.
//
// Reads the `site_json` table (populated by the data-refresh workflow) with the
// service-role key over PostgREST via plain fetch() — deliberately NOT the
// @supabase/supabase-js client, which eagerly spins up a realtime WebSocket and
// throws "native WebSocket not found" on Node < 22. A simple SELECT needs none of
// that. Credentials come from the environment (Vercel build env); for local runs
// it also loads a git-ignored .env.local.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env.local loader for local dev (Vercel already has env vars set).
function loadEnvLocal() {
  const f = resolve(ROOT, ".env.local");
  if (!existsSync(f)) return;
  for (const line of readFileSync(f, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "✗ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. On Vercel add them to " +
        "Project → Environment Variables; locally put them in .env.local.",
    );
    process.exit(1);
  }
  // Page past PostgREST's 1000-row cap (well above our ~43 files, but safe).
  const rows = [];
  const page = 1000;
  const rest = url.replace(/\/$/, "") + "/rest/v1/site_json";
  for (let from = 0; ; from += page) {
    const res = await fetch(
      `${rest}?select=path,content&order=path&offset=${from}&limit=${page}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) {
      throw new Error(`site_json read failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    rows.push(...data);
    if (data.length < page) break;
  }
  if (rows.length === 0) {
    console.error(
      "✗ site_json is empty — run the calculators + publish_site_json.py first " +
        "(or trigger a data-refresh workflow).",
    );
    process.exit(1);
  }

  // In the CI deploy gate the calculators have already written this run's fresh
  // slice locally; PREFETCH_FILL_MISSING=1 tells us to fill only the OTHER slices
  // from site_json and never clobber the fresh files (so the gate audits fresh
  // data before it's published). On Vercel the env is unset and the workspace is
  // a clean clone, so every file is written.
  const fillMissing = process.env.PREFETCH_FILL_MISSING === "1";
  let written = 0, skipped = 0, bytes = 0;
  for (const { path, content } of rows) {
    const full = resolve(ROOT, "data", path);
    if (fillMissing && existsSync(full)) {
      skipped++;
      continue;
    }
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
    written++;
    bytes += content.length;
  }
  console.log(
    `✓ prefetched ${written} JSON files from Supabase (${(bytes / 1e6).toFixed(1)} MB) -> data/` +
      (skipped ? ` (${skipped} local files kept)` : ""),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
