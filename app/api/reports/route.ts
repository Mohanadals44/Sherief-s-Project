import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export async function GET() {
  const rows = await db
    .select({
      id: schema.reports.id,
      kind: schema.reports.kind,
      title: schema.reports.title,
      status: schema.reports.status,
      error: schema.reports.error,
      createdAt: schema.reports.createdAt,
      completedAt: schema.reports.completedAt,
      topicId: schema.reports.topicId,
    })
    .from(schema.reports)
    .orderBy(desc(schema.reports.createdAt))
    .limit(50);
  return NextResponse.json({ reports: rows });
}
