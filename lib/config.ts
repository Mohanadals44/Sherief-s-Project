export type AgentName = "dailyBriefing" | "deepResearch" | "socialGrok" | "synthesize";

export const AGENT_NAMES: AgentName[] = [
  "dailyBriefing",
  "deepResearch",
  "socialGrok",
  "synthesize",
];

export const AGENT_LABELS: Record<AgentName, string> = {
  dailyBriefing: "Daily Briefing",
  deepResearch: "Deep Research",
  socialGrok: "Social (Grok on X)",
  synthesize: "Synthesizer",
};

export const AGENT_DESCRIPTIONS: Record<AgentName, string> = {
  dailyBriefing:
    "Produces a structured daily digest from the configured news outlets. Defaults to Gemini 3 Pro for broad synthesis.",
  deepResearch:
    "Runs a plan-gather-synthesize loop to approximate a true 'deep research' product. Defaults to Claude Opus 4.5 for strong long-form reasoning.",
  socialGrok:
    "Uses Grok's native X/live-web search to surface trending posts and sentiment. Defaults to Grok 4 Fast Reasoning.",
  synthesize:
    "Merges the three streams into the final report. Defaults to GPT-5 for tight, structured output.",
};

export const DEFAULT_MODEL_BY_AGENT: Record<AgentName, string> = {
  dailyBriefing: "gemini-3.1-pro",
  deepResearch: "claude-4.5-opus-high-thinking",
  socialGrok: "grok-4.3",
  synthesize: "gpt-5.5-medium",
};

export const modelSettingKey = (agent: AgentName) => `model.${agent}`;

export const DEFAULT_SETTINGS: Array<{ key: string; value: string }> = AGENT_NAMES.map((name) => ({
  key: modelSettingKey(name),
  value: DEFAULT_MODEL_BY_AGENT[name],
}));

export function requireCursorApiKey(): string {
  const key = process.env.CURSOR_API_KEY;
  if (!key || key === "cursor_replace_me") {
    throw new Error(
      "CURSOR_API_KEY is not set. Copy .env.local.example to .env.local and fill in a key from https://cursor.com/dashboard/cloud-agents",
    );
  }
  return key;
}
