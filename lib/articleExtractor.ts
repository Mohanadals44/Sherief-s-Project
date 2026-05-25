import { extract } from "@extractus/article-extractor";

export type ExtractionStatus = "success" | "failed" | "paywalled" | "skipped";

export interface ArticleExtraction {
  status: ExtractionStatus;
  text?: string;
  resolvedUrl?: string;
  error?: string;
}

export interface ExtractionOptions {
  timeoutMs?: number;
  maxChars?: number;
  minChars?: number;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_CHARS = 6_000;
const DEFAULT_MIN_CHARS = 500;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function looksPaywalled(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("subscribe to continue") ||
    lower.includes("subscription required") ||
    lower.includes("sign in to continue") ||
    lower.includes("register to continue") ||
    lower.includes("to continue reading") ||
    lower.includes("paywall")
  );
}

export async function extractArticleText(url: string, opts: ExtractionOptions = {}): Promise<ArticleExtraction> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const minChars = opts.minChars ?? DEFAULT_MIN_CHARS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const article = await extract(
      url,
      { contentLengthThreshold: 200 },
      {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X) NewsOrchestration/0.1 article extraction",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      },
    );

    const raw = article?.content ? stripHtml(article.content) : "";
    const text = raw.slice(0, maxChars);
    if (!text || text.length < minChars) {
      return {
        status: looksPaywalled(raw) ? "paywalled" : "failed",
        resolvedUrl: article?.url,
        error: text ? `extracted text too short (${text.length} chars)` : "no article text extracted",
      };
    }

    return {
      status: looksPaywalled(text) ? "paywalled" : "success",
      text,
      resolvedUrl: article?.url,
    };
  } catch (err) {
    return {
      status: "failed",
      error: (err as Error).name === "AbortError" ? `timed out after ${timeoutMs}ms` : (err as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}
