import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestUpstreamResults, finalizeFromSynthesisPack } from "@/lib/orchestrator";
import { saveResultToPack } from "@/lib/promptPack";
import type { AgentName } from "@/lib/config";

const PasteSchema = z.object({
  action: z.literal("paste"),
  agent: z.enum(["dailyBriefing", "deepResearch", "socialGrok", "synthesize"]),
  result: z.string().min(1),
});

const IngestSchema = z.object({ action: z.literal("ingest") });
const FinalizeSchema = z.object({ action: z.literal("finalize") });

const ActionSchema = z.discriminatedUnion("action", [PasteSchema, IngestSchema, FinalizeSchema]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const reportId = Number(id);
  if (!Number.isFinite(reportId)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const body = await req.json();
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  if (parsed.data.action === "paste") {
    await saveResultToPack(reportId, parsed.data.agent as AgentName, parsed.data.result);
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "ingest") {
    const res = await ingestUpstreamResults(reportId);
    return NextResponse.json(res);
  }

  if (parsed.data.action === "finalize") {
    const res = await finalizeFromSynthesisPack(reportId);
    if (res.ok) return NextResponse.json({ ok: true });
    return NextResponse.json({ error: res.error }, { status: 400 });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
