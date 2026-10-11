// Fire the Vercel deploy hook only when the published data actually changed.
//
// Every data workflow used to POST VERCEL_DEPLOY_HOOK after each run (~300
// production builds a month, most rebuilding identical data). This is now the
// ONLY place that POSTs it. It hashes the site_json table the way the build does
// (scripts/data-version.mjs) and compares with the live site's
// /data-version.json, which the build that is currently live wrote. Deploys when:
//   - the data hash differs (new draws, prize counts, news, charity pots, ...), or
//   - the newest rankings generatedAt is > MAX_DEPLOY_LAG_HOURS (default 12)
//     ahead of the live one — keeps "Updated <date>" current once per scratch
//     batch, and is the same rule check_deploy_freshness.py alarms on, or
//   - the live data-version.json can't be read (first deploy, site down), or
//   - --force.
// Comparing against the LIVE site (not a stored "last triggered" value) means a
// failed or cancelled build is retried by the next run instead of being
// forgotten.
//
//   node scripts/trigger-deploy-if-changed.mjs            # check, deploy if needed
//   node scripts/trigger-deploy-if-changed.mjs --dry-run  # check only, never POST
//   node scripts/trigger-deploy-if-changed.mjs --force    # deploy regardless
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VERCEL_DEPLOY_HOOK (not needed
// with --dry-run), SITE_URL (default https://lottizen.com), MAX_DEPLOY_LAG_HOURS.
// Writes deployed=true|false to $GITHUB_OUTPUT. Exit 0 when no deploy is needed;
// exit 1 only if a needed deploy could not be triggered. The hook URL is a
// secret and is never printed (the repo's Actions logs are public).
import { appendFileSync } from "node:fs";
import { loadEnvLocal, fetchSiteJson, dataVersion } from "./data-version.mjs";

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const FORCE = args.has("--force");

function output(deployed) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `deployed=${deployed}\n`);
}

async function liveVersion(site) {
  try {
    const r = await fetch(`${site}/data-version.json?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "User-Agent": "lottizen-deploy-trigger/1.0" },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const v = await r.json();
    return typeof v?.hash === "string" ? v : { error: "no hash in data-version.json" };
  } catch (e) {
    return { error: String(e).slice(0, 200) };
  }
}

async function main() {
  loadEnvLocal();
  const site = (process.env.SITE_URL || "https://lottizen.com").replace(/\/$/, "");
  const maxLag = Number(process.env.MAX_DEPLOY_LAG_HOURS || "12");

  const current = dataVersion(await fetchSiteJson());
  const live = await liveVersion(site);
  console.log(`site_json: ${current.files} files, data version ${current.hash.slice(0, 12)}, rankings generatedAt ${current.rankingsGeneratedAt}`);
  console.log(
    live.error
      ? `live:      ${site}/data-version.json unreadable (${live.error})`
      : `live:      ${live.files} files, data version ${live.hash.slice(0, 12)}, rankings generatedAt ${live.rankingsGeneratedAt}, built ${live.builtAt}`,
  );

  let reason = null;
  if (FORCE) reason = "--force";
  else if (live.error) reason = "live data version unknown";
  else if (live.hash !== current.hash) reason = "published data changed";
  else if (current.rankingsGeneratedAt && live.rankingsGeneratedAt) {
    const lag = (Date.parse(current.rankingsGeneratedAt) - Date.parse(live.rankingsGeneratedAt)) / 3600e3;
    if (lag > maxLag) reason = `live "Updated" stamp ${lag.toFixed(1)}h behind (> ${maxLag}h)`;
  }

  if (!reason) {
    console.log("✓ live site already carries this data — no deploy needed");
    output(false);
    return;
  }
  if (DRY) {
    console.log(`[dry-run] would trigger a Vercel deploy: ${reason}`);
    output(false);
    return;
  }
  const hook = process.env.VERCEL_DEPLOY_HOOK;
  if (!hook) {
    console.error(`✗ deploy needed (${reason}) but VERCEL_DEPLOY_HOOK is not set`);
    output(false);
    process.exit(1);
  }
  const r = await fetch(hook, { method: "POST", signal: AbortSignal.timeout(30000) });
  if (!r.ok) {
    console.error(`✗ deploy hook returned HTTP ${r.status}`);
    output(false);
    process.exit(1);
  }
  console.log(`✓ Vercel deploy triggered (${reason})`);
  output(true);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
