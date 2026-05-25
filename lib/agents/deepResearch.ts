import { runMultiStepAgent, resolveModelForAgent, type MultiStepResult } from "./cursor";
import { articleLanguage, type RssArticle } from "../rss";

export interface DeepResearchInput {
  topic: string;
  seedArticles: RssArticle[];
  onResolved?: (info: { cursorAgentId: string; cursorRunId: string; modelId: string }) => void | Promise<void>;
}

export const DEEP_RESEARCH_SYSTEM = `You are the Deep Research agent in a multi-agent news pipeline. We are approximating a "deep research" product with a three-step loop inside a single conversation:

1) PLAN - decompose the topic into 4-7 concrete sub-questions that, if answered, would give a reader a comprehensive briefing.
2) GATHER - answer each sub-question using (a) the seed articles provided below, (b) your prior knowledge (clearly labeled), and (c) any live lookups available to you in this environment via the shell tool (e.g. 'curl -sL "https://html.duckduckgo.com/html/?q=<query>"' piped to grep/head for headlines). Keep URLs and cite everything.
3) SYNTHESIZE - produce a long-form markdown brief.

You have access to a shell tool; use it judiciously (at most ~10 invocations total) to pull additional web context. If a shell call fails or is blocked, continue with what you have and note the limitation. Do NOT invent citations.
The seed article JSON may include a fullText field when extraction succeeded. Treat fullText as the strongest article context. If extractionStatus is failed/paywalled/skipped, fall back to the RSS summary and URL.

Output rules for the final synthesis:
- Start with a 2-3 sentence tl;dr.
- Then produce two clearly separated source-language sections:
  - "## English-language papers" - write in English and synthesize evidence from language="en" sources.
  - "## الصحف العربية" - write in Arabic and synthesize evidence from language="ar" sources.
- Within each source-language section, use one H3 per relevant sub-question. Where English and Arabic sources frame the same issue differently, state that difference explicitly in the language section where it belongs.
- Do not translate the Arabic-paper section into English. Keep Arabic outlet names and Arabic framing in Arabic. The English-paper section should remain in English.
- End with:
  - "Key uncertainties" (3-5 bullets)
  - "What would change the picture" (2-4 bullets)
  - "Sources" (bulleted list of [Outlet/Domain - Title](url) for every URL you cite)
- Use inline markdown citations throughout: [NYT](url).
- Target 1500-2500 words.
- No preamble outside the sections above.`;

export interface DeepResearchSteps {
  plan: string;
  gather: string;
  synthesize: string;
}

export function buildDeepResearchSteps(input: DeepResearchInput): DeepResearchSteps {
  const seedCompact = input.seedArticles.slice(0, 40).map((a) => ({
    outlet: a.outlet,
    category: a.category,
    language: articleLanguage(a.category),
    title: a.title,
    url: a.link,
    resolvedUrl: a.resolvedUrl ?? null,
    published: a.pubDate ? new Date(a.pubDate).toISOString() : null,
    extractionStatus: a.extractionStatus ?? "not_attempted",
    summary: (a.contentSnippet ?? a.content ?? "").slice(0, 400),
    fullText: a.fullText ? a.fullText.slice(0, 5_000) : null,
  }));
  const topic = input.topic.trim();
  return {
    plan:
      `TOPIC: ${topic}\n\n` +
      `SEED_ARTICLES_JSON (${seedCompact.length} articles from configured outlets that might be relevant):\n` +
      `\`\`\`json\n${JSON.stringify(seedCompact, null, 2)}\n\`\`\`\n\n` +
      `Step 1 of 3: PLAN. Produce a numbered list of 4-7 sub-questions that a thorough briefing on this topic must answer. For each sub-question, add a one-sentence note on what a good answer looks like. Do not start researching yet. Output the plan only.`,
    gather:
      `Step 2 of 3: GATHER. For each sub-question from your plan, produce a short research note (3-8 sentences) answering it. You may use the shell tool up to ~10 times total to pull extra web context with commands like:\n` +
      `  curl -sL --max-time 20 "https://html.duckduckgo.com/html/?q=<url-encoded-query>" | head -c 40000\n` +
      `  curl -sL --max-time 20 "https://www.reuters.com/site-search/?query=<query>" | head -c 40000\n` +
      `For Arabic-source sub-questions, also search Arabic terms and Arabic outlet domains where useful (e.g. site:aawsat.com, site:alquds.co.uk, site:alaraby.co.uk, site:annahar.com, site:aliwaa.com.lb). Record every URL you cite. Where the seed articles are sufficient, cite those instead. Clearly label any claim that comes only from prior knowledge with "[background]". Output a structured markdown document with one H3 per sub-question and keep Arabic-source notes in Arabic.`,
    synthesize:
      `Step 3 of 3: SYNTHESIZE. Now produce the final deep-research brief on "${topic}" following the output rules in the system note exactly: tl;dr, a separate English-language papers section in English, a separate الصحف العربية section in Arabic, Key uncertainties, What would change the picture, Sources. Output only the final markdown report - no preamble, no restatement of your plan.`,
  };
}

export async function deepResearch(input: DeepResearchInput): Promise<MultiStepResult> {
  const modelId = await resolveModelForAgent("deepResearch");
  const steps = buildDeepResearchSteps(input);
  return runMultiStepAgent({
    agent: "deepResearch",
    systemNote: DEEP_RESEARCH_SYSTEM,
    steps: [
      { label: "plan", prompt: steps.plan },
      { label: "gather", prompt: steps.gather },
      { label: "synthesize", prompt: steps.synthesize },
    ],
    modelId,
    onResolved: input.onResolved,
  });
}
