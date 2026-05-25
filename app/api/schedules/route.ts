import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isCronValid, registerOne, unregisterOne } from "@/lib/scheduler";

export async function GET() {
  const rows = await db
    .select({
      id: schema.schedules.id,
      kind: schema.schedules.kind,
      topicId: schema.schedules.topicId,
      topicLabel: schema.topics.label,
      cronExpr: schema.schedules.cronExpr,
      enabled: schema.schedules.enabled,
      lastRunAt: schema.schedules.lastRunAt,
      nextRunAt: schema.schedules.nextRunAt,
      createdAt: schema.schedules.createdAt,
    })
    .from(schema.schedules)
    .leftJoin(schema.topics, eq(schema.topics.id, schema.schedules.topicId))
    .orderBy(desc(schema.schedules.createdAt));
  return NextResponse.json({ schedules: rows });
}

const CreateSchema = z
  .object({
    kind: z.enum(["daily_briefing", "topic_research"]),
    topicId: z.number().int().optional(),
    cronExpr: z.string().min(5),
    enabled: z.boolean().default(true),
  })
  .refine((v) => v.kind === "daily_briefing" || typeof v.topicId === "number", {
    message: "topicId required for topic_research",
    path: ["topicId"],
  });

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  if (!isCronValid(parsed.data.cronExpr)) {
    return NextResponse.json({ error: "invalid cron expression" }, { status: 400 });
  }
  const [row] = await db
    .insert(schema.schedules)
    .values({
      kind: parsed.data.kind,
      topicId: parsed.data.topicId ?? null,
      cronExpr: parsed.data.cronExpr,
      enabled: parsed.data.enabled,
    })
    .returning();
  await registerOne(row.id);
  return NextResponse.json({ schedule: row }, { status: 201 });
}

const PatchSchema = z.object({
  id: z.number().int(),
  enabled: z.boolean().optional(),
  cronExpr: z.string().min(5).optional(),
});

export async function PATCH(req: Request) {
  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  if (parsed.data.cronExpr && !isCronValid(parsed.data.cronExpr)) {
    return NextResponse.json({ error: "invalid cron expression" }, { status: 400 });
  }
  const { id, ...rest } = parsed.data;
  const [row] = await db.update(schema.schedules).set(rest).where(eq(schema.schedules.id, id)).returning();
  await registerOne(id);
  return NextResponse.json({ schedule: row });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  unregisterOne(id);
  await db.delete(schema.schedules).where(eq(schema.schedules.id, id));
  return NextResponse.json({ ok: true });
}
