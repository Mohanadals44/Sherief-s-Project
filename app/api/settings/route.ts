import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { AGENT_NAMES, DEFAULT_MODEL_BY_AGENT, modelSettingKey } from "@/lib/config";

export async function GET() {
  const rows = await db.select().from(schema.settings);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  const models: Record<string, string> = {};
  for (const agent of AGENT_NAMES) {
    models[agent] = map[modelSettingKey(agent)] ?? DEFAULT_MODEL_BY_AGENT[agent];
  }
  return NextResponse.json({ models });
}

const PatchSchema = z.object({
  models: z.record(z.enum(AGENT_NAMES as unknown as [string, ...string[]]), z.string().min(1)),
});

export async function PATCH(req: Request) {
  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  for (const [agent, modelId] of Object.entries(parsed.data.models)) {
    const key = modelSettingKey(agent as (typeof AGENT_NAMES)[number]);
    const existing = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    if (existing) {
      await db
        .update(schema.settings)
        .set({ value: modelId, updatedAt: new Date() })
        .where(eq(schema.settings.key, key));
    } else {
      await db.insert(schema.settings).values({ key, value: modelId });
    }
  }
  return NextResponse.json({ ok: true });
}

export async function POST() {
  for (const agent of AGENT_NAMES) {
    const key = modelSettingKey(agent);
    const val = DEFAULT_MODEL_BY_AGENT[agent];
    const existing = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    if (existing) {
      await db.update(schema.settings).set({ value: val, updatedAt: new Date() }).where(eq(schema.settings.key, key));
    } else {
      await db.insert(schema.settings).values({ key, value: val });
    }
  }
  return NextResponse.json({ ok: true, reset: true });
}
