// Vercel build prefetch: materialize the site JSON from Supabase to data/ so
// `next build` can import it. Runs BEFORE gen_data_index.mjs (see package.json
// prebuild). Pure Node + @supabase/supabase-js — no Python on the Vercel build.
//
// Reads the `site_json` table (populated by the data-refresh workflow) with the
// service-role key and writes each row's content to data/<path>. Credentials
// come from the environment (Vercel build env); for local runs it also loads a
// git-ignored .env.local.
import { createClient } from "@supabase/supabase-js";
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
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Page past PostgREST's 1000-row cap (well above our ~43 files, but safe).
  const rows = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from("site_json")
      .select("path,content")
      .range(from, from + page - 1);
    if (error) throw new Error(`site_json read failed: ${error.message}`);
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
