import Parser from "rss-parser";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import type { Outlet } from "./db/schema";
import { extractArticleText, type ExtractionStatus } from "./articleExtractor";

export interface RssArticle {
  outlet: string;
  outletId: number;
  category: string;
  title: string;
  link: string;
  pubDate: string | null;
  contentSnippet?: string;
  content?: string;
  fullText?: string;
  resolvedUrl?: string;
  extractionStatus?: ExtractionStatus;
  extractionError?: string;
}

const parser = new Parser({
  timeout: 15_000,
  headers: {
    "User-Agent":
      "NewsOrchestration/0.1 (+https://local) rss-parser/3 (feed reader for a personal multi-agent dashboard)",
    Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
  },
});

function normalizeTitle(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ");
}

function firstN<T>(arr: T[], n: number): T[] {
  return arr.length <= n ? arr : arr.slice(0, n);
}

export function articleLanguage(category: string): "ar" | "en" {
  return category === "arabic" ? "ar" : "en";
}

export async function fetchOutlet(outlet: Outlet, opts?: { windowHours?: number; perOutletCap?: number }): Promise<RssArticle[]> {
  const windowMs = (opts?.windowHours ?? 24) * 60 * 60 * 1000;
  const cutoff = Date.now() - windowMs;
  try {
    const feed = await parser.parseURL(outlet.rssUrl);
    const items = feed.items ?? [];
    const mapped: RssArticle[] = [];
    for (const item of items) {
      if (!item.title || !item.link) continue;
      const published = item.isoDate ?? item.pubDate ?? null;
      const publishedMs = published ? Date.parse(published) : NaN;
      if (!Number.isNaN(publishedMs) && publishedMs < cutoff) continue;
      mapped.push({
        outlet: outlet.name,
        outletId: outlet.id,
        category: outlet.category,
        title: item.title,
        link: item.link,
        pubDate: published ?? null,
        contentSnippet: item.contentSnippet,
        content: item.content,
      });
    }
    return firstN(mapped, opts?.perOutletCap ?? 15);
  } catch (err) {
    console.warn(`[rss] failed to fetch ${outlet.name} (${outlet.rssUrl}): ${(err as Error).message}`);
    return [];
  }
}

export interface FetchAllOptions {
  windowHours?: number;
  perOutletCap?: number;
  totalCap?: number;
  extractFullText?: boolean;
  extractionLimit?: number;
  extractionMaxChars?: number;
  extractionConcurrency?: number;
}

export async function fetchAllEnabled(opts: FetchAllOptions = {}): Promise<RssArticle[]> {
  const rows = await db.select().from(schema.outlets).where(eq(schema.outlets.enabled, true));
  return fetchMany(rows, opts);
}

export async function fetchMany(outletsArg: Outlet[], opts: FetchAllOptions = {}): Promise<RssArticle[]> {
  const results = await Promise.all(outletsArg.map((o) => fetchOutlet(o, opts)));
  const flat = results.flat();

  const byUrl = new Map<string, RssArticle>();
  const byTitle = new Map<string, RssArticle>();
  for (const a of flat) {
    const keyUrl = a.link;
    const keyTitle = normalizeTitle(a.title);
    if (byUrl.has(keyUrl)) continue;
    if (byTitle.has(keyTitle)) continue;
    byUrl.set(keyUrl, a);
    byTitle.set(keyTitle, a);
  }
  const deduped = Array.from(byUrl.values());

  deduped.sort((a, b) => {
    const ta = a.pubDate ? Date.parse(a.pubDate) : 0;
    const tb = b.pubDate ? Date.parse(b.pubDate) : 0;
    return tb - ta;
  });

  const totalCap = opts.totalCap ?? 150;
  const capped = firstN(deduped, totalCap);
  if (!opts.extractFullText) return capped;
  return enrichArticlesWithFullText(capped, {
    limit: opts.extractionLimit ?? 50,
    maxChars: opts.extractionMaxChars ?? 6_000,
    concurrency: opts.extractionConcurrency ?? 4,
  });
}

export async function enrichArticlesWithFullText(
  articles: RssArticle[],
  opts: { limit?: number; maxChars?: number; concurrency?: number } = {},
): Promise<RssArticle[]> {
  const limit = opts.limit ?? 50;
  const concurrency = opts.concurrency ?? 4;
  const maxChars = opts.maxChars ?? 6_000;
  const enriched = articles.map((article) => ({ ...article, extractionStatus: "skipped" as ExtractionStatus }));
  let next = 0;

  async function worker() {
    while (next < Math.min(limit, enriched.length)) {
      const index = next;
      next += 1;
      const article = enriched[index];
      const extracted = await extractArticleText(article.link, { maxChars });
      enriched[index] = {
        ...article,
        fullText: extracted.text,
        resolvedUrl: extracted.resolvedUrl,
        extractionStatus: extracted.status,
        extractionError: extracted.error,
      };
      if (extracted.status !== "success") {
        console.warn(`[article] ${article.outlet}: ${article.title.slice(0, 80)} -> ${extracted.status}${extracted.error ? ` (${extracted.error})` : ""}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, limit, enriched.length) }, () => worker()));
  return enriched;
}

export async function relatedArticlesForTopic(
  topic: string,
  opts: FetchAllOptions & { maxMatches?: number } = {},
): Promise<RssArticle[]> {
  const rows = await db.select().from(schema.outlets).where(eq(schema.outlets.enabled, true));
  const all = await fetchMany(rows, { ...opts, windowHours: opts.windowHours ?? 72, totalCap: 500 });
  const tokens = topic
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/gu)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) {
    const matched = firstN(all, opts.maxMatches ?? 40);
    return opts.extractFullText
      ? enrichArticlesWithFullText(matched, {
          limit: opts.extractionLimit ?? 40,
          maxChars: opts.extractionMaxChars ?? 8_000,
          concurrency: opts.extractionConcurrency ?? 4,
        })
      : matched;
  }
  const scored = all
    .map((a) => {
      const hay = `${a.title} ${a.contentSnippet ?? ""}`.toLowerCase();
      const score = tokens.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);
  const matched = firstN(scored, opts.maxMatches ?? 40);
  return opts.extractFullText
    ? enrichArticlesWithFullText(matched, {
        limit: opts.extractionLimit ?? 40,
        maxChars: opts.extractionMaxChars ?? 8_000,
        concurrency: opts.extractionConcurrency ?? 4,
      })
    : matched;
}
