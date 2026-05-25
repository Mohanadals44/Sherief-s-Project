import { runAgent, resolveModelForAgent, type RunAgentResult } from "./cursor";
import { articleLanguage, type RssArticle } from "../rss";

export interface DailyBriefingInput {
  articles: RssArticle[];
  windowHours: number;
  topicHint?: string;
  onResolved?: (info: { cursorAgentId: string; cursorRunId: string; modelId: string }) => void | Promise<void>;
}

export const DAILY_BRIEFING_SYSTEM = `You are the Daily Briefing agent in a multi-agent news pipeline. Your job is to read a JSON array of recent articles from major news outlets and produce a crisp, structured markdown digest of what is happening in the world. You do NOT have live internet access in this turn - use only the articles I provide.

Rules:
- Split the report into two top-level sections:
  1. "## English-language papers" - write this section in English and use only articles where language="en".
  2. "## الصحف العربية" - write this section in Arabic and use only articles where language="ar".
- Within each language section, group by theme (e.g. "Geopolitics", "Economy & Markets", "Technology", "Policy", "Conflict", "Climate", "Other"; and Arabic equivalents under the Arabic section). Collapse empty themes.
- Inside each theme, pick the 3-6 most important stories; merge duplicate coverage from different outlets into a single bullet with multi-source citations.
- Every bullet must have at least one inline citation in markdown link form: [Outlet Name](url).
- Prefer the fullText field when extractionStatus="success"; otherwise fall back to summary/snippet. Do not assume a missing fullText means the story is unimportant.
- Prefer verifiable facts over opinion framing. Flag anything that is allegation/rumor with "(reported)".
- End with a "Signals to watch" section: 3-5 bullets of what might matter next week, derived only from the provided articles.
- If one language has no meaningful articles, include a one-sentence note under that language section saying so.
- Keep total length under ~1600 words.
- Output ONLY the markdown report. No preamble, no sign-off.`;

export function buildDailyBriefingPrompt(input: DailyBriefingInput): string {
  const compact = input.articles.map((a) => ({
    outlet: a.outlet,
    category: a.category,
    language: articleLanguage(a.category),
    title: a.title,
    url: a.link,
    resolvedUrl: a.resolvedUrl ?? null,
    published: a.pubDate ? new Date(a.pubDate).toISOString() : null,
    extractionStatus: a.extractionStatus ?? "not_attempted",
    summary: (a.contentSnippet ?? a.content ?? "").slice(0, 400),
    fullText: a.fullText ? a.fullText.slice(0, 3_500) : null,
  }));

  const topicLine = input.topicHint
    ? `\nTopic focus hint (bias grouping toward this if articles support it, but do not invent relevance): ${input.topicHint}\n`
    : "";

  return (
    `Window: articles from the last ${input.windowHours} hours (${compact.length} total after dedupe).${topicLine}\n` +
    `ARTICLES_JSON:\n\`\`\`json\n${JSON.stringify(compact, null, 2)}\n\`\`\`\n\n` +
    `Produce the markdown briefing now, following the rules in the system note.`
  );
}

export async function dailyBriefing(input: DailyBriefingInput): Promise<RunAgentResult> {
  const modelId = await resolveModelForAgent("dailyBriefing");
  return runAgent({
    agent: "dailyBriefing",
    prompt: buildDailyBriefingPrompt(input),
    systemNote: DAILY_BRIEFING_SYSTEM,
    modelId,
    onResolved: input.onResolved,
  });
}
