import { eq } from "drizzle-orm";
import { format } from "date-fns";
import { db, schema } from "./db";
import { fetchAllEnabled, relatedArticlesForTopic } from "./rss";
import { dailyBriefing, DAILY_BRIEFING_SYSTEM, buildDailyBriefingPrompt } from "./agents/dailyBriefing";
import { deepResearch, DEEP_RESEARCH_SYSTEM, buildDeepResearchSteps } from "./agents/deepResearch";
import { socialGrok, SOCIAL_GROK_SYSTEM, buildSocialGrokPrompt } from "./agents/socialGrok";
import { synthesize, SYNTHESIZE_SYSTEM, buildSynthesizePrompt } from "./agents/synthesize";
import { resolveModelForAgent } from "./agents/cursor";
import { getExecutionMode } from "./runtime";
import { writePromptPack, readResultFromPack, listPackStatus } from "./promptPack";
import type { AgentName } from "./config";

type RunRow = typeof schema.runs.$inferSelect;

async function createReportRow(
  kind: "daily_briefing" | "topic_research",
  title: string,
  topicId: number | null,
): Promise<number> {
  const res = await db
    .insert(schema.reports)
    .values({ kind, topicId, title, markdown: "", status: "running" })
    .returning({ id: schema.reports.id });
  return res[0].id;
}

async function setReportStatus(
  reportId: number,
  status: "pending" | "running" | "awaiting_upstream" | "awaiting_synthesis" | "done" | "error",
  patch: Partial<typeof schema.reports.$inferInsert> = {},
) {
  await db
    .update(schema.reports)
    .set({ status, ...patch })
    .where(eq(schema.reports.id, reportId));
}

async function markReportDone(reportId: number, markdown: string, metadata: Record<string, unknown>) {
  await db
    .update(schema.reports)
    .set({ markdown, status: "done", metadata, completedAt: new Date() })
    .where(eq(schema.reports.id, reportId));
}

async function markReportError(reportId: number, error: string) {
  await db
    .update(schema.reports)
    .set({ status: "error", error, completedAt: new Date() })
    .where(eq(schema.reports.id, reportId));
}

async function startRunRow(reportId: number, agentName: AgentName): Promise<number> {
  const res = await db
    .insert(schema.runs)
    .values({ reportId, agentName, status: "running" })
    .returning({ id: schema.runs.id });
  return res[0].id;
}

async function finishRunRow(
  runId: number,
  ok: boolean,
  data: {
    cursorAgentId?: string;
    cursorRunId?: string;
    modelId?: string;
    output?: string;
    error?: string;
    durationMs?: number;
    status?: "done" | "error" | "awaiting_manual";
  },
) {
  const updates: Partial<RunRow> = {
    status: data.status ?? (ok ? "done" : "error"),
    endedAt: ok ? new Date() : undefined,
    cursorAgentId: data.cursorAgentId,
    cursorRunId: data.cursorRunId,
    modelId: data.modelId,
    output: data.output,
    error: data.error,
    durationMs: data.durationMs,
  };
  await db.update(schema.runs).set(updates).where(eq(schema.runs.id, runId));
}

async function attachResolvedInfo(
  runId: number,
  info: { cursorAgentId: string; cursorRunId: string; modelId: string },
) {
  await db
    .update(schema.runs)
    .set({ cursorAgentId: info.cursorAgentId, cursorRunId: info.cursorRunId, modelId: info.modelId })
    .where(eq(schema.runs.id, runId));
}

export interface OrchestratorProgress {
  reportId: number;
  stage: "rss" | "dailyBriefing" | "deepResearch" | "socialGrok" | "synthesize" | "awaiting_upstream" | "awaiting_synthesis" | "done" | "error";
  message: string;
}

export type ProgressCallback = (p: OrchestratorProgress) => void;
const noopProgress: ProgressCallback = () => {};

async function writeFallbackPack(
  reportId: number,
  agent: AgentName,
  systemNote: string,
  prompt: string,
  stepLabels?: string[],
): Promise<{ modelId: string; path: string }> {
  const modelId = await resolveModelForAgent(agent);
  const loc = await writePromptPack({ reportId, agent, model: modelId, systemNote, prompt, stepLabels });
  return { modelId, path: loc.relativePath };
}

export async function runDailyBriefing(
  opts: { topicHint?: string; progress?: ProgressCallback } = {},
): Promise<{ reportId: number; mode: "cli" | "files" }> {
  const progress = opts.progress ?? noopProgress;
  const today = format(new Date(), "EEEE, MMMM d, yyyy");
  const title = `Daily briefing - ${today}`;
  const reportId = await createReportRow("daily_briefing", title, null);
  const mode = await getExecutionMode();

  progress({ reportId, stage: "rss", message: "Fetching RSS feeds..." });
  try {
    const articles = await fetchAllEnabled({
      windowHours: 24,
      perOutletCap: 12,
      totalCap: 140,
      extractFullText: true,
      extractionLimit: 50,
      extractionMaxChars: 6_000,
      extractionConcurrency: 4,
    });
    if (articles.length === 0) {
      await markReportError(reportId, "No articles returned from any enabled outlet in the last 24h.");
      progress({ reportId, stage: "error", message: "No articles fetched" });
      return { reportId, mode };
    }

    if (mode === "files") {
      const briefingPrompt = buildDailyBriefingPrompt({
        articles,
        windowHours: 24,
        topicHint: opts.topicHint,
      });
      const socialPrompt = buildSocialGrokPrompt(opts.topicHint ?? "top world news today");

      const dailyRunId = await startRunRow(reportId, "dailyBriefing");
      const socialRunId = await startRunRow(reportId, "socialGrok");

      const briefingPack = await writeFallbackPack(reportId, "dailyBriefing", DAILY_BRIEFING_SYSTEM, briefingPrompt);
      const socialPack = await writeFallbackPack(reportId, "socialGrok", SOCIAL_GROK_SYSTEM, socialPrompt);

      await finishRunRow(dailyRunId, false, {
        status: "awaiting_manual",
        modelId: briefingPack.modelId,
        output: `Prompt pack: ${briefingPack.path}`,
      });
      await finishRunRow(socialRunId, false, {
        status: "awaiting_manual",
        modelId: socialPack.modelId,
        output: `Prompt pack: ${socialPack.path}`,
      });

      await setReportStatus(reportId, "awaiting_upstream", {
        metadata: { articleCount: articles.length, mode, requiredAgents: ["dailyBriefing", "socialGrok"] },
      });
      progress({
        reportId,
        stage: "awaiting_upstream",
        message: "Prompt packs written. Open and run them in Cursor, paste results, click Ingest.",
      });
      return { reportId, mode };
    }

    progress({ reportId, stage: "dailyBriefing", message: "Daily Briefing + Social agents running via CLI..." });
    const dailyRunId = await startRunRow(reportId, "dailyBriefing");
    const socialRunId = await startRunRow(reportId, "socialGrok");

    const [briefingRes, socialRes] = await Promise.allSettled([
      dailyBriefing({
        articles,
        windowHours: 24,
        topicHint: opts.topicHint,
        onResolved: (info) => attachResolvedInfo(dailyRunId, info),
      }),
      socialGrok({
        topic: opts.topicHint ?? "top world news today",
        onResolved: (info) => attachResolvedInfo(socialRunId, info),
      }),
    ]);

    let briefingMd: string | null = null;
    let socialMd: string | null = null;

    if (briefingRes.status === "fulfilled") {
      briefingMd = briefingRes.value.output;
      await finishRunRow(dailyRunId, true, {
        cursorAgentId: briefingRes.value.cursorAgentId,
        cursorRunId: briefingRes.value.cursorRunId,
        modelId: briefingRes.value.modelId,
        output: briefingRes.value.output,
        durationMs: briefingRes.value.durationMs,
      });
    } else {
      await finishRunRow(dailyRunId, false, { error: String(briefingRes.reason?.message ?? briefingRes.reason) });
    }

    if (socialRes.status === "fulfilled") {
      socialMd = socialRes.value.output;
      await finishRunRow(socialRunId, true, {
        cursorAgentId: socialRes.value.cursorAgentId,
        cursorRunId: socialRes.value.cursorRunId,
        modelId: socialRes.value.modelId,
        output: socialRes.value.output,
        durationMs: socialRes.value.durationMs,
      });
    } else {
      await finishRunRow(socialRunId, false, { error: String(socialRes.reason?.message ?? socialRes.reason) });
    }

    if (!briefingMd && !socialMd) {
      await markReportError(reportId, "Both briefing and social agents failed.");
      progress({ reportId, stage: "error", message: "All agents failed" });
      return { reportId, mode };
    }

    progress({ reportId, stage: "synthesize", message: "Synthesizing..." });
    const synthRunId = await startRunRow(reportId, "synthesize");
    try {
      const synth = await synthesize({
        kind: "daily_briefing",
        title,
        briefingMd,
        researchMd: null,
        socialMd,
        onResolved: (info) => attachResolvedInfo(synthRunId, info),
      });
      await finishRunRow(synthRunId, true, {
        cursorAgentId: synth.cursorAgentId,
        cursorRunId: synth.cursorRunId,
        modelId: synth.modelId,
        output: synth.output,
        durationMs: synth.durationMs,
      });
      await markReportDone(reportId, synth.output, {
        articleCount: articles.length,
        briefingFailed: briefingRes.status === "rejected",
        socialFailed: socialRes.status === "rejected",
        mode,
      });
      progress({ reportId, stage: "done", message: "Done" });
      return { reportId, mode };
    } catch (err) {
      await finishRunRow(synthRunId, false, { error: (err as Error).message });
      await markReportError(reportId, `Synthesizer failed: ${(err as Error).message}`);
      progress({ reportId, stage: "error", message: (err as Error).message });
      return { reportId, mode };
    }
  } catch (err) {
    await markReportError(reportId, (err as Error).message);
    progress({ reportId, stage: "error", message: (err as Error).message });
    return { reportId, mode };
  }
}

export async function runTopicResearch(
  topicId: number,
  opts: { progress?: ProgressCallback } = {},
): Promise<{ reportId: number; mode: "cli" | "files" }> {
  const progress = opts.progress ?? noopProgress;
  const topic = await db.select().from(schema.topics).where(eq(schema.topics.id, topicId)).get();
  if (!topic) throw new Error(`Topic ${topicId} not found`);
  const today = format(new Date(), "MMM d, yyyy");
  const title = `Deep dive: ${topic.label} (${today})`;
  const reportId = await createReportRow("topic_research", title, topicId);
  const mode = await getExecutionMode();

  progress({ reportId, stage: "rss", message: "Fetching topic-related articles..." });
  try {
    const seedArticles = await relatedArticlesForTopic(topic.label, {
      windowHours: 72,
      perOutletCap: 8,
      maxMatches: 40,
      extractFullText: true,
      extractionLimit: 40,
      extractionMaxChars: 8_000,
      extractionConcurrency: 4,
    });

    if (mode === "files") {
      const briefingPrompt = buildDailyBriefingPrompt({
        articles: seedArticles,
        windowHours: 72,
        topicHint: topic.label,
      });
      const researchSteps = buildDeepResearchSteps({ topic: topic.label, seedArticles });
      const researchCombined =
        `# Deep Research - 3 steps in the same Cursor chat (keep context!)\n\n` +
        `### Step 1: PLAN\n\n${researchSteps.plan}\n\n---\n\n` +
        `### Step 2: GATHER\n\nAfter the agent answers step 1, send this:\n\n${researchSteps.gather}\n\n---\n\n` +
        `### Step 3: SYNTHESIZE\n\nAfter the agent answers step 2, send this:\n\n${researchSteps.synthesize}\n\n` +
        `**Paste only the final step-3 output below the marker.**`;
      const socialPrompt = buildSocialGrokPrompt(topic.label);

      const dailyRunId = await startRunRow(reportId, "dailyBriefing");
      const researchRunId = await startRunRow(reportId, "deepResearch");
      const socialRunId = await startRunRow(reportId, "socialGrok");

      const briefingPack = await writeFallbackPack(reportId, "dailyBriefing", DAILY_BRIEFING_SYSTEM, briefingPrompt);
      const researchPack = await writeFallbackPack(
        reportId,
        "deepResearch",
        DEEP_RESEARCH_SYSTEM,
        researchCombined,
        ["plan", "gather", "synthesize"],
      );
      const socialPack = await writeFallbackPack(reportId, "socialGrok", SOCIAL_GROK_SYSTEM, socialPrompt);

      await finishRunRow(dailyRunId, false, {
        status: "awaiting_manual",
        modelId: briefingPack.modelId,
        output: `Prompt pack: ${briefingPack.path}`,
      });
      await finishRunRow(researchRunId, false, {
        status: "awaiting_manual",
        modelId: researchPack.modelId,
        output: `Prompt pack: ${researchPack.path}`,
      });
      await finishRunRow(socialRunId, false, {
        status: "awaiting_manual",
        modelId: socialPack.modelId,
        output: `Prompt pack: ${socialPack.path}`,
      });

      await setReportStatus(reportId, "awaiting_upstream", {
        metadata: {
          topicId,
          articleCount: seedArticles.length,
          mode,
          requiredAgents: ["dailyBriefing", "deepResearch", "socialGrok"],
        },
      });
      progress({ reportId, stage: "awaiting_upstream", message: "Prompt packs ready. Run them in Cursor, paste results, click Ingest." });
      return { reportId, mode };
    }

    progress({ reportId, stage: "dailyBriefing", message: "Briefing + research + social in parallel via CLI..." });
    const dailyRunId = await startRunRow(reportId, "dailyBriefing");
    const researchRunId = await startRunRow(reportId, "deepResearch");
    const socialRunId = await startRunRow(reportId, "socialGrok");

    const [briefingRes, researchRes, socialRes] = await Promise.allSettled([
      dailyBriefing({
        articles: seedArticles,
        windowHours: 72,
        topicHint: topic.label,
        onResolved: (info) => attachResolvedInfo(dailyRunId, info),
      }),
      deepResearch({
        topic: topic.label,
        seedArticles,
        onResolved: (info) => attachResolvedInfo(researchRunId, info),
      }),
      socialGrok({
        topic: topic.label,
        onResolved: (info) => attachResolvedInfo(socialRunId, info),
      }),
    ]);

    let briefingMd: string | null = null;
    let researchMd: string | null = null;
    let socialMd: string | null = null;

    if (briefingRes.status === "fulfilled") {
      briefingMd = briefingRes.value.output;
      await finishRunRow(dailyRunId, true, {
        cursorAgentId: briefingRes.value.cursorAgentId,
        cursorRunId: briefingRes.value.cursorRunId,
        modelId: briefingRes.value.modelId,
        output: briefingRes.value.output,
        durationMs: briefingRes.value.durationMs,
      });
    } else {
      await finishRunRow(dailyRunId, false, { error: String(briefingRes.reason?.message ?? briefingRes.reason) });
    }

    if (researchRes.status === "fulfilled") {
      researchMd = researchRes.value.final;
      await finishRunRow(researchRunId, true, {
        cursorAgentId: researchRes.value.cursorAgentId,
        cursorRunId: researchRes.value.cursorRunId,
        modelId: researchRes.value.modelId,
        output: researchRes.value.final,
        durationMs: researchRes.value.durationMs,
      });
    } else {
      await finishRunRow(researchRunId, false, { error: String(researchRes.reason?.message ?? researchRes.reason) });
    }

    if (socialRes.status === "fulfilled") {
      socialMd = socialRes.value.output;
      await finishRunRow(socialRunId, true, {
        cursorAgentId: socialRes.value.cursorAgentId,
        cursorRunId: socialRes.value.cursorRunId,
        modelId: socialRes.value.modelId,
        output: socialRes.value.output,
        durationMs: socialRes.value.durationMs,
      });
    } else {
      await finishRunRow(socialRunId, false, { error: String(socialRes.reason?.message ?? socialRes.reason) });
    }

    if (!briefingMd && !researchMd && !socialMd) {
      await markReportError(reportId, "All three upstream agents failed.");
      progress({ reportId, stage: "error", message: "All agents failed" });
      return { reportId, mode };
    }

    progress({ reportId, stage: "synthesize", message: "Synthesizing..." });
    const synthRunId = await startRunRow(reportId, "synthesize");
    try {
      const synth = await synthesize({
        kind: "topic_research",
        title,
        topic: topic.label,
        briefingMd,
        researchMd,
        socialMd,
        onResolved: (info) => attachResolvedInfo(synthRunId, info),
      });
      await finishRunRow(synthRunId, true, {
        cursorAgentId: synth.cursorAgentId,
        cursorRunId: synth.cursorRunId,
        modelId: synth.modelId,
        output: synth.output,
        durationMs: synth.durationMs,
      });
      await markReportDone(reportId, synth.output, {
        topicId,
        articleCount: seedArticles.length,
        briefingFailed: briefingRes.status === "rejected",
        researchFailed: researchRes.status === "rejected",
        socialFailed: socialRes.status === "rejected",
        mode,
      });
      await db.update(schema.topics).set({ lastResearchedAt: new Date() }).where(eq(schema.topics.id, topicId));
      progress({ reportId, stage: "done", message: "Done" });
      return { reportId, mode };
    } catch (err) {
      await finishRunRow(synthRunId, false, { error: (err as Error).message });
      await markReportError(reportId, `Synthesizer failed: ${(err as Error).message}`);
      progress({ reportId, stage: "error", message: (err as Error).message });
      return { reportId, mode };
    }
  } catch (err) {
    await markReportError(reportId, (err as Error).message);
    progress({ reportId, stage: "error", message: (err as Error).message });
    return { reportId, mode };
  }
}

export async function ingestUpstreamResults(
  reportId: number,
): Promise<{
  missing: AgentName[];
  ready: AgentName[];
  synthesisPack?: { path: string; modelId: string };
}> {
  const report = await db.select().from(schema.reports).where(eq(schema.reports.id, reportId)).get();
  if (!report) throw new Error(`Report ${reportId} not found`);
  const meta = (report.metadata ?? {}) as Record<string, unknown>;
  const required = (meta.requiredAgents as AgentName[] | undefined) ?? ["dailyBriefing", "socialGrok"];

  const statuses = await listPackStatus(reportId, required);
  const missing = statuses.filter((s) => !s.hasResult).map((s) => s.agent);
  const ready = statuses.filter((s) => s.hasResult).map((s) => s.agent);
  if (missing.length > 0) return { missing, ready };

  const briefingMd = required.includes("dailyBriefing") ? await readResultFromPack(reportId, "dailyBriefing") : null;
  const researchMd = required.includes("deepResearch") ? await readResultFromPack(reportId, "deepResearch") : null;
  const socialMd = required.includes("socialGrok") ? await readResultFromPack(reportId, "socialGrok") : null;

  const runs = await db.select().from(schema.runs).where(eq(schema.runs.reportId, reportId));
  for (const run of runs) {
    const agent = run.agentName as AgentName;
    let output: string | null = null;
    if (agent === "dailyBriefing") output = briefingMd;
    else if (agent === "deepResearch") output = researchMd;
    else if (agent === "socialGrok") output = socialMd;
    if (output) {
      await db.update(schema.runs).set({ status: "done", output, endedAt: new Date() }).where(eq(schema.runs.id, run.id));
    }
  }

  const synthesizePrompt = buildSynthesizePrompt({
    kind: report.kind,
    title: report.title,
    topic: report.topicId ? ((await db.select().from(schema.topics).where(eq(schema.topics.id, report.topicId)).get())?.label ?? undefined) : undefined,
    briefingMd,
    researchMd,
    socialMd,
  });
  const synthModelId = await resolveModelForAgent("synthesize");
  const loc = await writePromptPack({
    reportId,
    agent: "synthesize",
    model: synthModelId,
    systemNote: SYNTHESIZE_SYSTEM,
    prompt: synthesizePrompt,
  });

  const existingSynthRun = runs.find((r) => r.agentName === "synthesize");
  if (!existingSynthRun) {
    await db.insert(schema.runs).values({
      reportId,
      agentName: "synthesize",
      status: "awaiting_manual",
      modelId: synthModelId,
      output: `Prompt pack: ${loc.relativePath}`,
    });
  }

  await setReportStatus(reportId, "awaiting_synthesis", {
    metadata: { ...meta, ingestedAt: Date.now(), synthesisPath: loc.relativePath },
  });

  return { missing: [], ready, synthesisPack: { path: loc.relativePath, modelId: synthModelId } };
}

export async function finalizeFromSynthesisPack(reportId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const report = await db.select().from(schema.reports).where(eq(schema.reports.id, reportId)).get();
  if (!report) return { ok: false, error: "report not found" };
  const result = await readResultFromPack(reportId, "synthesize");
  if (!result) return { ok: false, error: "No synthesis result found in synthesize.prompt.md. Paste the model output below the marker and save." };

  const synthRun = (await db.select().from(schema.runs).where(eq(schema.runs.reportId, reportId))).find((r) => r.agentName === "synthesize");
  if (synthRun) {
    await db
      .update(schema.runs)
      .set({ status: "done", output: result, endedAt: new Date() })
      .where(eq(schema.runs.id, synthRun.id));
  }
  await markReportDone(reportId, result, {
    ...((report.metadata as Record<string, unknown>) ?? {}),
    manualFinalizedAt: Date.now(),
  });
  if (report.topicId) {
    await db.update(schema.topics).set({ lastResearchedAt: new Date() }).where(eq(schema.topics.id, report.topicId));
  }
  return { ok: true };
}
