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
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ROOT, loadEnvLocal, fetchSiteJson, dataVersion } from "./data-version.mjs";

async function main() {
  loadEnvLocal();
  let rows;
  try {
    rows = await fetchSiteJson();
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
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
  // Record which data this build carries (public/data-version.json, served by
  // the live site). trigger-deploy-if-changed.mjs compares against it so the
  // deploy hook only fires when site_json actually changed.
  const version = { ...dataVersion(rows), builtAt: new Date().toISOString() };
  writeFileSync(resolve(ROOT, "public", "data-version.json"), JSON.stringify(version) + "\n");
  console.log(
    `✓ prefetched ${written} JSON files from Supabase (${(bytes / 1e6).toFixed(1)} MB) -> data/` +
      (skipped ? ` (${skipped} local files kept)` : "") +
      `; data version ${version.hash.slice(0, 12)}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
