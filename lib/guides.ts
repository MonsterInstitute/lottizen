import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";
import type { Country } from "@/config/games";

/**
 * Long-form editorial "guides" content layer. Articles are plain Markdown files
 * in content/guides/*.md with YAML frontmatter — separated from code so the copy
 * can be authored and reviewed on its own. Parsed at build time (SSG); nothing
 * here runs at request time.
 */
const GUIDES_DIR = path.join(process.cwd(), "content", "guides");

export interface GuideSource {
  title: string;
  url: string;
}
export interface GuideFaq {
  q: string;
  a: string;
}
export interface GuideFrontmatter {
  title: string;
  description: string;
  /** Which audience the guide serves; drives grouping + related-game linking. */
  country: Country | "ALL";
  /** Game slugs this guide is relevant to (powers the two-way internal linking). */
  relatedGames: string[];
  date: string; // YYYY-MM-DD first published
  updated?: string; // YYYY-MM-DD last substantive update
  eyebrow?: string; // small label above the headline (defaults per country)
  sources?: GuideSource[];
  faqs?: GuideFaq[]; // optional — rendered + emitted as FAQPage JSON-LD
  draft?: boolean;
}
export interface GuideMeta extends GuideFrontmatter {
  slug: string;
}
export interface TocItem {
  id: string;
  text: string;
  level: number; // 2 or 3
}
export interface Guide extends GuideMeta {
  html: string; // rendered body; H2/H3 carry stable ids for the TOC
  toc: TocItem[];
  readingMinutes: number;
}

function slugFromFile(f: string): string {
  return f.replace(/\.md$/, "");
}

export function getGuideSlugs(): string[] {
  if (!fs.existsSync(GUIDES_DIR)) return [];
  return fs
    .readdirSync(GUIDES_DIR)
    .filter((f) => f.endsWith(".md"))
    .map(slugFromFile);
}

/** YAML parses an unquoted `2026-07-10` into a Date object, not a string. Coerce
 *  date fields back to "YYYY-MM-DD" strings so downstream formatting is stable
 *  whether an author quoted the date or not. */
function toDateStr(v: unknown): string | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function readRaw(slug: string) {
  const parsed = matter(fs.readFileSync(path.join(GUIDES_DIR, `${slug}.md`), "utf8"));
  const d = parsed.data as Record<string, unknown>;
  if ("date" in d) d.date = toDateStr(d.date);
  if ("updated" in d) d.updated = toDateStr(d.updated);
  return parsed;
}

/** All non-draft guides, newest first. Metadata only (no body render). A single
 *  file with malformed frontmatter is skipped with a warning rather than thrown —
 *  this function feeds the sitemap and every game page's related-guides block, so
 *  one bad file must not break unrelated pages. */
export function getAllGuides(): GuideMeta[] {
  const out: GuideMeta[] = [];
  for (const slug of getGuideSlugs()) {
    try {
      const data = readRaw(slug).data as GuideFrontmatter;
      if (!data.draft) out.push({ slug, ...data });
    } catch (err) {
      console.warn(`[guides] skipping ${slug}: ${(err as Error).message}`);
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&[^;]+;/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Render one guide: Markdown -> HTML (GFM tables etc.), inject stable heading
 *  ids, and build the table of contents from H2/H3. */
export function getGuide(slug: string): Guide {
  const { data, content } = readRaw(slug);
  const fm = data as GuideFrontmatter;
  marked.setOptions({ gfm: true, breaks: false });
  let html = marked.parse(content) as string;

  // Wrap tables so wide tax-rate tables scroll horizontally on mobile instead of
  // blowing out the page width.
  html = html
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, "</table></div>");

  const toc: TocItem[] = [];
  const used = new Set<string>();
  html = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_m, lvl: string, inner: string) => {
    const text = inner
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "’")
      .trim();
    let id = slugify(text) || "section";
    const base = id;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    toc.push({ id, text, level: Number(lvl) });
    return `<h${lvl} id="${id}">${inner}</h${lvl}>`;
  });

  const words = content.split(/\s+/).filter(Boolean).length;
  return { slug, ...fm, html, toc, readingMinutes: Math.max(1, Math.round(words / 220)) };
}

/** Split rendered HTML at H2 boundaries so the template can interleave in-article
 *  ad units between whole sections (never mid-paragraph). */
export function splitAtSections(html: string): string[] {
  const parts = html.split(/(?=<h2\b)/);
  return parts.filter((p) => p.trim().length > 0);
}

/** Guides relevant to a given game — powers the "Related guides" block on the
 *  game's overview and FAQ pages. Newest first. */
export function guidesForGame(slug: string): GuideMeta[] {
  return getAllGuides().filter((g) => g.relatedGames?.includes(slug));
}

/** Other guides to surface at the foot of an article: same audience, or sharing
 *  a related game. */
export function relatedGuides(current: GuideMeta, limit = 3): GuideMeta[] {
  return getAllGuides()
    .filter((g) => g.slug !== current.slug)
    .filter(
      (g) =>
        g.country === current.country ||
        g.relatedGames?.some((s) => current.relatedGames?.includes(s)),
    )
    .slice(0, limit);
}

/** Hub grouping: guides bucketed by audience, in display order. */
export function guidesByCountry(): { country: Country | "ALL"; guides: GuideMeta[] }[] {
  const all = getAllGuides();
  const order: (Country | "ALL")[] = ["CA", "US", "EU", "ALL"];
  return order
    .map((c) => ({ country: c, guides: all.filter((g) => g.country === c) }))
    .filter((b) => b.guides.length > 0);
}
