// Data version of the site: a hash of everything the Vercel build reads from
// Supabase (the site_json table), shared by the build and the deploy trigger.
//
//   - prefetch_supabase.mjs (prebuild) writes public/data-version.json with the
//     hash it built with, so the LIVE site always says which data it carries.
//   - trigger-deploy-if-changed.mjs hashes site_json the same way and only POSTs
//     the Vercel deploy hook when that differs from the live data-version.json.
//
// The hash ignores per-run timestamps (generatedAt / scrapedAt): every workflow
// run restamps them even when nothing else changed, and a deploy that only moves
// "Updated <date>" is not worth a 2,400-page rebuild. The "Updated" stamp is
// still kept current: the trigger also deploys when the newest rankings
// generatedAt is more than MAX_DEPLOY_LAG_HOURS ahead of the live one (the same
// rule check_deploy_freshness.py uses), i.e. at most once per scratch batch.
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const VOLATILE_KEYS = new Set(["generatedAt", "scrapedAt"]);

// Minimal .env.local loader for local runs (Vercel / CI already have env vars).
export function loadEnvLocal() {
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

/** All site_json rows ({path, content}), read over PostgREST with plain fetch(). */
export async function fetchSiteJson() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. On Vercel add them to " +
        "Project → Environment Variables; locally put them in .env.local.",
    );
  }
  // Page past PostgREST's 1000-row cap (well above our ~60 files, but safe).
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
  return rows;
}

function stripVolatile(v) {
  if (Array.isArray(v)) return v.map(stripVolatile);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v)) if (!VOLATILE_KEYS.has(k)) out[k] = stripVolatile(x);
    return out;
  }
  return v;
}

/** {hash, rankingsGeneratedAt, files} for a set of site_json rows. */
export function dataVersion(rows) {
  const h = createHash("sha256");
  let rankingsGeneratedAt = null;
  for (const { path, content } of [...rows].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    let body = content;
    try {
      const parsed = JSON.parse(content);
      if (path.startsWith("rankings/") && typeof parsed?.generatedAt === "string") {
        if (!rankingsGeneratedAt || parsed.generatedAt > rankingsGeneratedAt) {
          rankingsGeneratedAt = parsed.generatedAt;
        }
      }
      body = JSON.stringify(stripVolatile(parsed));
    } catch {
      // Not JSON — hash the raw text.
    }
    h.update(path).update("\0").update(body).update("\0");
  }
  return { hash: h.digest("hex"), rankingsGeneratedAt, files: rows.length };
}
