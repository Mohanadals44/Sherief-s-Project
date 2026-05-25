import { NextResponse } from "next/server";
import { z } from "zod";
import { runDailyBriefing, runTopicResearch } from "@/lib/orchestrator";
import { db, schema } from "@/lib/db";

const Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("daily_briefing"), topicHint: z.string().optional() }),
  z.object({ kind: z.literal("topic_research"), topicId: z.number().int().optional(), topicLabel: z.string().min(2).optional() }),
]);

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  if (parsed.data.kind === "daily_briefing") {
    queueMicrotask(() => {
      runDailyBriefing({ topicHint: parsed.data.kind === "daily_briefing" ? parsed.data.topicHint : undefined }).catch((err) =>
        console.error("runDailyBriefing background failure:", err),
      );
    });
    return NextResponse.json({ queued: true, kind: "daily_briefing" });
  }

  let topicId = parsed.data.topicId;
  if (!topicId && parsed.data.topicLabel) {
    const [row] = await db
      .insert(schema.topics)
      .values({ label: parsed.data.topicLabel })
      .returning({ id: schema.topics.id });
    topicId = row.id;
  }
  if (!topicId) {
    return NextResponse.json({ error: "topicId or topicLabel required" }, { status: 400 });
  }
  const tid = topicId;
  queueMicrotask(() => {
    runTopicResearch(tid).catch((err) => console.error("runTopicResearch background failure:", err));
  });
  return NextResponse.json({ queued: true, kind: "topic_research", topicId });
}
