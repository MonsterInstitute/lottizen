/**
 * Build-time access to data/news/index.json, written by scripts/news_engine.py
 * from the news_items table. Every figure in an item was read from the data
 * by the detector that wrote it and passed the engine's number check — the
 * pages only lay the text out; they never compute or add a number.
 */
import data from "@/data/news/index.json";

export type NewsCategory = "draw" | "scratch" | "unclaimed";

export interface NewsFact {
  label: string;
  value: string;
  source: string;
  url: string | null;
}

export interface NewsItem {
  slug: string;
  kind: string;
  category: NewsCategory;
  game: string | null;
  headline: string;
  dek: string;
  body: string[];
  data_table: { columns: string[]; rows: string[][] } | null;
  facts: NewsFact[];
  data_date: string;
  published_at: string;
  updated_at: string;
}

export const CATEGORY_LABEL: Record<NewsCategory, string> = {
  draw: "Draw games",
  scratch: "Scratch tickets",
  unclaimed: "Unclaimed prizes",
};

export function getNews(): NewsItem[] {
  return (data as { items: NewsItem[] }).items;
}

export function getNewsItem(slug: string): NewsItem | undefined {
  return getNews().find((n) => n.slug === slug);
}
