/**
 * When each live draw game is drawn, which GitHub workflow fetches it, and how
 * to ask the official source cheaply whether a draw's numbers are out yet.
 * Used only by the draw-night watcher (app/api/cron/draw-watch) to fetch
 * results as soon as they're published and to measure "draw → live" latency.
 *
 * Times are the operators' scheduled draw times in local time. They're a
 * reference point for the latency measure, not shown to users.
 */

export type Workflow = "draws-daily.yml" | "usa-daily.yml" | "europe-daily.yml";
type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
const DAILY: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface DrawSchedule {
  slug: string;
  name: string;
  days: Day[];
  time: string; // "HH:MM" local
  tz: string;
  workflow: Workflow;
  /** Source keys from SOURCES that report this game's latest draw date.
   *  Empty = no lightweight source (the workflow is dispatched on a timer). */
  sources: string[];
}

const ET = "America/Toronto";
const NY = "America/New_York";

export const DRAW_SCHEDULE: DrawSchedule[] = [
  { slug: "lotto-max", name: "Lotto Max", days: ["Tue", "Fri"], time: "22:30", tz: ET, workflow: "draws-daily.yml", sources: ["olg", "playnow"] },
  { slug: "lotto-6-49", name: "Lotto 6/49", days: ["Wed", "Sat"], time: "22:30", tz: ET, workflow: "draws-daily.yml", sources: ["olg", "playnow"] },
  { slug: "daily-grand", name: "Daily Grand", days: ["Mon", "Thu"], time: "22:30", tz: ET, workflow: "draws-daily.yml", sources: ["olg", "playnow"] },
  { slug: "ontario-49", name: "Ontario 49", days: ["Wed", "Sat"], time: "22:30", tz: ET, workflow: "draws-daily.yml", sources: ["olg"] },
  { slug: "lottario", name: "Lottario", days: ["Sat"], time: "22:30", tz: ET, workflow: "draws-daily.yml", sources: ["olg"] },
  { slug: "megadice", name: "MegaDice Lotto", days: DAILY, time: "22:30", tz: ET, workflow: "draws-daily.yml", sources: ["olg"] },
  { slug: "bc-49", name: "BC/49", days: ["Wed", "Sat"], time: "22:30", tz: ET, workflow: "draws-daily.yml", sources: ["playnow"] },
  // WCLC's own games: their pages need a browser, so no quick check.
  { slug: "western-max", name: "Western Max", days: ["Tue", "Fri"], time: "22:30", tz: ET, workflow: "draws-daily.yml", sources: [] },
  { slug: "western-6-49", name: "Western 6/49", days: ["Wed", "Sat"], time: "22:30", tz: ET, workflow: "draws-daily.yml", sources: [] },
  { slug: "powerball", name: "Powerball", days: ["Mon", "Wed", "Sat"], time: "22:59", tz: NY, workflow: "usa-daily.yml", sources: ["ny"] },
  { slug: "mega-millions", name: "Mega Millions", days: ["Tue", "Fri"], time: "23:00", tz: NY, workflow: "usa-daily.yml", sources: ["mm", "ny"] },
  { slug: "new-york-lotto", name: "New York Lotto", days: ["Wed", "Sat"], time: "20:15", tz: NY, workflow: "usa-daily.yml", sources: ["ny"] },
  { slug: "take-5", name: "Take 5", days: DAILY, time: "22:30", tz: NY, workflow: "usa-daily.yml", sources: ["ny"] },
  { slug: "pick-10", name: "Pick 10", days: DAILY, time: "20:30", tz: NY, workflow: "usa-daily.yml", sources: ["ny"] },
  { slug: "numbers", name: "Numbers", days: DAILY, time: "22:30", tz: NY, workflow: "usa-daily.yml", sources: ["ny"] },
  { slug: "win-4", name: "Win 4", days: DAILY, time: "22:30", tz: NY, workflow: "usa-daily.yml", sources: ["ny"] },
  { slug: "euromillions", name: "EuroMillions", days: ["Tue", "Fri"], time: "21:00", tz: "Europe/Paris", workflow: "europe-daily.yml", sources: ["nl"] },
  { slug: "eurojackpot", name: "EuroJackpot", days: ["Tue", "Fri"], time: "21:00", tz: "Europe/Berlin", workflow: "europe-daily.yml", sources: ["lottode"] },
  { slug: "uk-lotto", name: "UK Lotto", days: ["Wed", "Sat"], time: "20:00", tz: "Europe/London", workflow: "europe-daily.yml", sources: ["nl"] },
];

// ---------------------------------------------------------------- time zones

function parts(t: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(t).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday as Day, h: +p.hour, m: +p.minute, s: +p.second };
}

/** The UTC instant of local wall time `date` + `time` in `tz`. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(t), tz);
    const [py, pm, pd] = p.date.split("-").map(Number);
    const asUtc = Date.UTC(py, pm - 1, pd, p.h, p.m, p.s);
    t = guess - (asUtc - t);
  }
  return new Date(t);
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The most recent scheduled draw at or before `now`. */
export function lastDraw(g: DrawSchedule, now: Date): { date: string; at: Date } {
  const today = parts(now, g.tz).date;
  for (let i = 0; i < 8; i++) {
    const date = addDays(today, -i);
    const at = zonedToUtc(date, g.time, g.tz);
    const wd = parts(at, g.tz).weekday;
    if (g.days.includes(wd) && at <= now) return { date, at };
  }
  throw new Error(`no draw in the last week for ${g.slug}`);
}

// ------------------------------------------------------------------ sources

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function get(url: string, headers: Record<string, string> = {}): Promise<string> {
  const r = await fetch(url, { headers: { "User-Agent": UA, ...headers }, cache: "no-store", signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.text();
}

const OLG_NAMES: Record<string, string> = {
  "LOTTO MAX": "lotto-max", "LOTTO 6/49": "lotto-6-49", "DAILY GRAND": "daily-grand",
  "ONTARIO 49": "ontario-49", LOTTARIO: "lottario", "MEGADICE LOTTO": "megadice", MEGADICE: "megadice",
};
const PLAYNOW: Record<string, string> = { LMAX: "lotto-max", SIX49: "lotto-6-49", DGRD: "daily-grand", BC49: "bc-49" };
const NY_DATASETS: Record<string, string> = {
  powerball: "d6yy-54nr", "mega-millions": "5xaw-6ayf", "new-york-lotto": "6nbc-h7bj",
  "take-5": "dg63-4siq", "pick-10": "bycu-cw7c", numbers: "hsys-3def", "win-4": "hsys-3def",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Each source returns {game slug: latest draw date it publishes}. The keys
 *  match DrawSchedule.sources; scripts/scrape_*.py read the same endpoints. */
export const SOURCES: Record<string, (slugs: string[]) => Promise<Record<string, string>>> = {
  async olg() {
    const j = JSON.parse(
      await get("https://gateway.www.olg.ca/feeds/winning-numbers", {
        Accept: "application/json", "x-site-code": "playolg.ca",
        "x-client-id": "9c92a16d25b542048aa93a397093efe2", Referer: "https://www.olg.ca/",
      }),
    );
    const out: Record<string, string> = {};
    for (const g of j?.WinningNumbers?.game ?? []) {
      const slug = OLG_NAMES[String(g.name ?? "").trim().toUpperCase()];
      if (slug && g.regular && /^\d{4}-\d{2}-\d{2}/.test(g.drawDate ?? "")) out[slug] = g.drawDate.slice(0, 10);
    }
    return out;
  },
  async playnow() {
    const j = JSON.parse(await get("https://www.playnow.com/services2/lotto/draw/latest", { Accept: "application/json" }));
    const out: Record<string, string> = {};
    for (const [key, slug] of Object.entries(PLAYNOW)) {
      const m = /^(\w{3}) (\d{1,2}), (\d{4})$/.exec(j?.[key]?.drawDate ?? "");
      if (m && j[key].drawNbrs?.length) {
        out[slug] = `${m[3]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
      }
    }
    return out;
  },
  async ny(slugs) {
    const out: Record<string, string> = {};
    const want = [...new Set(slugs.filter((s) => NY_DATASETS[s]).map((s) => NY_DATASETS[s]))];
    await Promise.all(
      want.map(async (ds) => {
        const j = JSON.parse(await get(`https://data.ny.gov/resource/${ds}.json?$select=max(draw_date)%20as%20d`));
        const d = String(j?.[0]?.d ?? "").slice(0, 10);
        if (d) for (const [s, x] of Object.entries(NY_DATASETS)) if (x === ds) out[s] = d;
      }),
    );
    return out;
  },
  async mm(): Promise<Record<string, string>> {
    const t = await get("https://www.megamillions.com/cmspages/utilservice.asmx/GetLatestDrawData");
    const m = /PlayDate\\?"\s*:\s*\\?"(\d{4}-\d{2}-\d{2})/.exec(t);
    return m ? { "mega-millions": m[1] } : {};
  },
  async nl(slugs) {
    const out: Record<string, string> = {};
    const urls: Record<string, string> = {
      euromillions: "https://www.national-lottery.co.uk/results/euromillions/draw-history/xml",
      "uk-lotto": "https://www.national-lottery.co.uk/results/lotto/draw-history/xml",
    };
    await Promise.all(
      slugs.filter((s) => urls[s]).map(async (s) => {
        const m = /<draw-date>\s*(\d{4}-\d{2}-\d{2})/.exec(await get(urls[s]));
        if (m) out[s] = m[1];
      }),
    );
    return out;
  },
  async lottode(): Promise<Record<string, string>> {
    const j = JSON.parse(await get("https://www.lotto.de/api/stats/entities.eurojackpot/last", { Accept: "application/json" }));
    return typeof j?.drawDate === "number" ? { eurojackpot: parts(new Date(j.drawDate), "Europe/Berlin").date } : {};
  },
};
