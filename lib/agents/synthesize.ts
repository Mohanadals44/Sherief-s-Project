import { runAgent, resolveModelForAgent, type RunAgentResult } from "./cursor";

export interface SynthesizeInput {
  kind: "daily_briefing" | "topic_research";
  title: string;
  topic?: string;
  briefingMd: string | null;
  researchMd: string | null;
  socialMd: string | null;
  onResolved?: (info: { cursorAgentId: string; cursorRunId: string; modelId: string }) => void | Promise<void>;
}

export const SYNTHESIZE_SYSTEM = `You are the Synthesizer agent in a multi-agent news pipeline. Three upstream agents (Daily Briefing, Deep Research, Social/Grok) have produced partial markdown reports. Your job is to merge them into a single cohesive final report.

Rules:
- Preserve real citations from the inputs; do NOT invent new URLs or sources.
- Do not drop important facts, but deduplicate overlapping coverage.
- Where Daily Briefing and Social disagree (e.g. fact vs. speculation), keep both and note it.
- If an input section is missing (null), skip the corresponding section without apologizing.
- Use a consistent, scannable structure.
- Keep source-language separation intact:
  - English-language paper/source coverage must be written in English.
  - Arabic-paper/source coverage must be under Arabic headings and written in Arabic.
  - Do not translate the Arabic-paper section into English unless you add a tiny parenthetical clarification for an English term.
- Keep total length appropriate: ~1100-1800 words for a daily briefing, ~2200-3500 words for a topic research report.

Required output structure:

# <Title>
*Generated <auto-describe-timing-like "Monday morning briefing">*

## Executive summary
3-6 bullets in English summarizing the overall report, with inline citation(s). If Arabic papers add a materially different angle, mention that briefly and cite it.

## English-language papers
Themed grouping in English (Geopolitics, Economy & Markets, Tech & Policy, Conflict, Climate, Other). Use the English-language paper/source coverage from the briefing and research inputs. Omit empty themes.

## الصحف العربية
اكتب هذا القسم بالعربية. اجمع تغطية الصحف والمواقع العربية في محاور واضحة مثل: لبنان والمنطقة، السياسة، الاقتصاد، الحرب/الأمن، الرأي والتحليل. استخدم فقط المصادر العربية أو المقاطع العربية من المدخلات، وحافظ على أسماء الصحف العربية كما هي.

## Deep dive: <topic>
Only include if a topic is specified. Use clear sub-sections. If the research input contains both English and Arabic-source analysis, split this deep dive internally into "English-source analysis" and "تحليل المصادر العربية".

## What X is saying
Short distilled section from the social input. Keep the "Caveats" idea but tighten it to 1-2 bullets.

## Signals to watch
4-6 bullets synthesizing forward-looking signals from all three inputs.

## Sources
Full bulleted list of every URL referenced in the report.

Output markdown only. No preamble.`;

export function buildSynthesizePrompt(input: SynthesizeInput): string {
  const parts: string[] = [];
  parts.push(`KIND: ${input.kind}`);
  parts.push(`TITLE: ${input.title}`);
  if (input.topic) parts.push(`TOPIC: ${input.topic}`);
  parts.push(
    `\n--- DAILY_BRIEFING_INPUT ---\n${input.briefingMd ?? "(not produced this run)"}\n--- END DAILY_BRIEFING_INPUT ---`,
  );
  parts.push(
    `\n--- DEEP_RESEARCH_INPUT ---\n${input.researchMd ?? "(not produced this run)"}\n--- END DEEP_RESEARCH_INPUT ---`,
  );
  parts.push(
    `\n--- SOCIAL_GROK_INPUT ---\n${input.socialMd ?? "(not produced this run)"}\n--- END SOCIAL_GROK_INPUT ---`,
  );
  parts.push(`\nProduce the final merged markdown report now, following the structure in the system note.`);
  return parts.join("\n");
}

export async function synthesize(input: SynthesizeInput): Promise<RunAgentResult> {
  const modelId = await resolveModelForAgent("synthesize");
  return runAgent({
    agent: "synthesize",
    prompt: buildSynthesizePrompt(input),
    systemNote: SYNTHESIZE_SYSTEM,
    modelId,
    onResolved: input.onResolved,
  });
}
