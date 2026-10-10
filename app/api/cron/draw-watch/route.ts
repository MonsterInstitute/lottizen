/**
 * Draw-night watcher, run by Vercel Cron every 5 minutes (vercel.json).
 *
 * GitHub's scheduler starts this repo's crons 4–7 hours late, so the daily
 * workflows alone put a 10:30 pm draw on the site the next afternoon. This
 * route doesn't depend on them: for every game whose latest scheduled draw
 * isn't on lottizen.com yet, it
 *   1. asks the official sources (lib/draw-schedule SOURCES) whether the
 *      numbers are out, recording when each source first showed them;
 *   2. dispatches the game's GitHub workflow (scrape → build gate → publish →
 *      Vercel deploy) the moment a source has them — or every 30 minutes for
 *      games with no quick check, or while a fetched draw still isn't live;
 *   3. records when the draw was stored and when it went live, so every draw
 *      has a measured "scheduled draw → live" latency (table draw_watch,
 *      reported in the daily ops email);
 *   4. adds the draw to an "[auto] Draw results over 2 hours late" issue once
 *      it's more than 2 hours past the draw and still not live, and closes the
 *      issue when everything late has gone live.
 */
import { NextResponse } from "next/server";
import { DRAW_SCHEDULE, SOURCES, lastDraw, type DrawSchedule, type Workflow } from "@/lib/draw-schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://lottizen.com").replace(/\/$/, "");
const REPO = process.env.GITHUB_REPOSITORY || "MonsterInstitute/lottizen";
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GH_TOKEN = process.env.GH_DISPATCH_TOKEN;

const WATCH_HOURS = 36; // after this, the daily workflows and freshness watchdog own it
const LATE_MIN = 120;
const RETRY_MIN = 30; // timer dispatch for games with no quick check / fetched-but-not-live
const MIN_GAP_MIN = 8; // never dispatch the same workflow more often than this
const ISSUE_TITLE = "[auto] Draw results over 2 hours late";

interface WatchRow {
  game_id: string;
  draw_date: string;
  scheduled_at: string;
  source_seen: Record<string, string>;
  first_source_at: string | null;
  dispatched_at: string | null;
  dispatches: number;
  stored_at: string | null;
  live_at: string | null;
  latency_min: number | null;
  alerted_at: string | null;
}

async function sb<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!SB_URL || !SB_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured");
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`supabase ${path.split("?")[0]} → ${r.status} ${await r.text()}`);
  const t = await r.text();
  return (t ? JSON.parse(t) : null) as T;
}

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  if (!GH_TOKEN) throw new Error("GH_DISPATCH_TOKEN not configured");
  return fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
}

interface Tracked {
  w: { g: DrawSchedule; date: string; at: Date };
  row: WatchRow;
  hasSource: boolean;
  isStored: boolean;
  isLiveNow: boolean;
}

const minutes = (a: Date | string, b: Date | string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const log: string[] = [];

  // Games whose latest scheduled draw is within the watch window.
  const recent = DRAW_SCHEDULE.map((g) => ({ g, ...lastDraw(g, now) })).filter(
    (x) => minutes(x.at, now) >= 0 && minutes(x.at, now) <= WATCH_HOURS * 60,
  );

  // What the live site carries.
  let live: Record<string, string> = {};
  try {
    const r = await fetch(`${SITE}/draw-status.json?t=${now.getTime()}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    live = (await r.json()).latest ?? {};
  } catch (e) {
    log.push(`draw-status.json unreadable: ${e}`);
    return NextResponse.json({ ok: false, log }, { status: 502 });
  }
  const isLive = (slug: string, date: string) => !!live[slug] && live[slug] >= date;

  // Existing watch rows and stored draws for these draws.
  const since = new Date(now.getTime() - (WATCH_HOURS + 24) * 3600e3).toISOString();
  const rows = await sb<WatchRow[]>(`draw_watch?scheduled_at=gte.${encodeURIComponent(since)}&select=*`);
  const rowOf = new Map(rows.map((r) => [`${r.game_id}|${r.draw_date}`, r]));
  const minDate = recent.reduce((m, x) => (x.date < m ? x.date : m), "9999-12-31");
  const stored = recent.length
    ? await sb<{ game_id: string; draw_date: string; scraped_at: string | null }[]>(
        `draws?select=game_id,draw_date,scraped_at&draw_date=gte.${minDate}&game_id=in.(${recent.map((x) => x.g.slug).join(",")})`,
      )
    : [];
  const storedOf = new Map(stored.map((s) => [`${s.game_id}|${s.draw_date}`, s]));

  // Draws to work on: not live yet, or live but still open in draw_watch.
  // A draw is only ever tracked if it was first seen NOT live, so latencies
  // are measured from the watcher's own observations.
  const work: { g: DrawSchedule; date: string; at: Date; row: WatchRow | undefined }[] = [];
  for (const x of recent) {
    const row = rowOf.get(`${x.g.slug}|${x.date}`);
    if (row?.live_at) continue;
    if (!row && isLive(x.g.slug, x.date)) continue;
    work.push({ ...x, row });
  }

  // Ask the sources (only the ones a pending game needs).
  const pending = work.filter((w) => !isLive(w.g.slug, w.date));
  const need = new Map<string, string[]>();
  for (const w of pending) for (const s of w.g.sources) need.set(s, [...(need.get(s) ?? []), w.g.slug]);
  const seen: Record<string, Record<string, string>> = {};
  await Promise.all(
    [...need].map(async ([src, slugs]) => {
      try {
        seen[src] = await SOURCES[src](slugs);
      } catch (e) {
        log.push(`source ${src} failed: ${String(e).slice(0, 200)}`);
      }
    }),
  );

  // Update rows.
  const upserts: Partial<WatchRow>[] = [];
  const nowIso = now.toISOString();
  const state = new Map<string, Tracked>();
  for (const w of work) {
    const key = `${w.g.slug}|${w.date}`;
    const row: WatchRow = w.row
      ? { ...w.row, source_seen: { ...(w.row.source_seen ?? {}) } }
      : {
          game_id: w.g.slug, draw_date: w.date, scheduled_at: w.at.toISOString(), source_seen: {},
          first_source_at: null, dispatched_at: null, dispatches: 0, stored_at: null, live_at: null,
          latency_min: null, alerted_at: null,
        };
    for (const src of w.g.sources) {
      const d = seen[src]?.[w.g.slug];
      if (d && d >= w.date && !row.source_seen[src]) row.source_seen[src] = nowIso;
    }
    const firsts = Object.values(row.source_seen).sort();
    row.first_source_at = firsts[0] ?? null;
    const st = storedOf.get(key);
    if (st && !row.stored_at) row.stored_at = nowIso;
    const liveNow = isLive(w.g.slug, w.date);
    if (liveNow && !row.live_at) {
      row.live_at = nowIso;
      row.latency_min = Math.round(minutes(row.scheduled_at, now));
    }
    state.set(key, { w, row, hasSource: firsts.length > 0, isStored: !!st, isLiveNow: liveNow });
  }

  // Dispatch: per workflow, at most once per MIN_GAP_MIN, and not while one is running.
  const byWf = new Map<Workflow, Tracked[]>();
  for (const s of state.values()) if (!s.isLiveNow) byWf.set(s.w.g.workflow, [...(byWf.get(s.w.g.workflow) ?? []), s]);
  const dispatched: string[] = [];
  for (const [wf, list] of byWf) {
    const last = list.map((s) => s.row.dispatched_at).filter(Boolean).sort().at(-1) ?? null;
    const sinceLast = last ? minutes(last, now) : Infinity;
    if (sinceLast < MIN_GAP_MIN) continue;
    // A source has numbers we haven't stored, and no dispatch since it did → go now.
    const fresh = list.some(
      (s) => s.hasSource && !s.isStored && (!s.row.dispatched_at || s.row.dispatched_at < s.row.first_source_at!),
    );
    // No quick check for this game, or stored/published but still not live → retry on a timer.
    const timer = list.some(
      (s) => (s.w.g.sources.length === 0 || s.isStored) && minutes(s.w.at, now) >= 15 && sinceLast >= RETRY_MIN,
    );
    // A source said it was out at an earlier dispatch but it still isn't stored → retry on a timer.
    const retry = list.some((s) => s.hasSource && sinceLast >= RETRY_MIN);
    if (!fresh && !timer && !retry) continue;
    try {
      const runs = await gh(`/actions/workflows/${wf}/runs?per_page=5`);
      const busy = runs.ok
        ? ((await runs.json()).workflow_runs ?? []).some((r: { status: string }) => r.status === "queued" || r.status === "in_progress")
        : false;
      if (busy) {
        log.push(`${wf}: already running`);
        continue;
      }
      const r = await gh(`/actions/workflows/${wf}/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main" }) });
      if (!r.ok) throw new Error(`dispatch ${wf} → ${r.status} ${await r.text()}`);
      dispatched.push(wf);
      for (const s of list) {
        s.row.dispatched_at = nowIso;
        s.row.dispatches += 1;
      }
    } catch (e) {
      log.push(String(e).slice(0, 300));
    }
  }

  // Late alerts.
  const late = [...state.values()].filter((s) => !s.isLiveNow && minutes(s.w.at, now) > LATE_MIN && !s.row.alerted_at);
  if (late.length) {
    try {
      const lines = late.map((s) => {
        const src = Object.entries(s.row.source_seen);
        return (
          `- **${s.w.g.name}** ${s.w.date} (drawn ${s.w.at.toISOString().slice(0, 16).replace("T", " ")} UTC): ` +
          `${Math.round(minutes(s.w.at, now))} min since the draw, not live. ` +
          (src.length
            ? `Official source had it at ${src.map(([k, v]) => `${k} ${v.slice(11, 16)} UTC`).join(", ")}; `
            : s.w.g.sources.length
              ? `official sources (${s.w.g.sources.join(", ")}) don't have it yet; `
              : `no quick source check for this game; `) +
          `${s.isStored ? "stored in Supabase" : "not stored yet"}; ${s.row.dispatches} workflow dispatch(es).`
        );
      });
      const body = `Draws more than ${LATE_MIN / 60} hours past their scheduled time and still not on ${SITE}:\n\n${lines.join("\n")}\n\nThe draw-night watcher (app/api/cron/draw-watch) keeps retrying; this issue closes itself once they're live.`;
      const list = await gh(`/issues?state=open&labels=auto-monitor&per_page=100`);
      const open = list.ok ? ((await list.json()) as { number: number; title: string }[]).find((i) => i.title === ISSUE_TITLE) : undefined;
      const r = open
        ? await gh(`/issues/${open.number}/comments`, { method: "POST", body: JSON.stringify({ body }) })
        : await gh(`/issues`, { method: "POST", body: JSON.stringify({ title: ISSUE_TITLE, body, labels: ["auto-monitor"] }) });
      if (!r.ok) throw new Error(`issue → ${r.status}`);
      for (const s of late) s.row.alerted_at = nowIso;
    } catch (e) {
      log.push(`alert failed: ${String(e).slice(0, 200)}`);
    }
  }

  // Close the issue once nothing alerted is still waiting.
  const stillLate = [...state.values()].some((s) => s.row.alerted_at && !s.isLiveNow);
  const justRecovered = [...state.values()].some((s) => s.row.alerted_at && s.isLiveNow);
  if (justRecovered && !stillLate) {
    try {
      const list = await gh(`/issues?state=open&labels=auto-monitor&per_page=100`);
      const open = list.ok ? ((await list.json()) as { number: number; title: string }[]).find((i) => i.title === ISSUE_TITLE) : undefined;
      if (open) {
        await gh(`/issues/${open.number}/comments`, { method: "POST", body: JSON.stringify({ body: "✅ Every late draw is live now. Auto-closing." }) });
        await gh(`/issues/${open.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
      }
    } catch (e) {
      log.push(`close failed: ${String(e).slice(0, 200)}`);
    }
  }

  for (const s of state.values()) upserts.push({ ...s.row, updated_at: nowIso } as Partial<WatchRow>);
  if (upserts.length) {
    await sb(`draw_watch?on_conflict=game_id,draw_date`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(upserts),
    });
  }

  return NextResponse.json({
    ok: true,
    checked: recent.length,
    tracking: [...state.values()].map((s) => ({
      game: s.w.g.slug, date: s.w.date, live: s.isLiveNow, stored: s.isStored,
      sources: Object.keys(s.row.source_seen), latency_min: s.row.latency_min,
    })),
    dispatched,
    log,
  });
}
