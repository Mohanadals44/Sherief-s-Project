import { NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rid = Number(id);
  if (!Number.isFinite(rid)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const report = await db.select().from(schema.reports).where(eq(schema.reports.id, rid)).get();
  if (!report) return NextResponse.json({ error: "not found" }, { status: 404 });
  const runs = await db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.reportId, rid))
    .orderBy(asc(schema.runs.startedAt));
  return NextResponse.json({ report, runs });
}
