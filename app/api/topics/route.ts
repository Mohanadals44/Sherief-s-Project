import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export async function GET() {
  const rows = await db.select().from(schema.topics).orderBy(desc(schema.topics.createdAt));
  return NextResponse.json({ topics: rows });
}

const CreateSchema = z.object({
  label: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  const [row] = await db
    .insert(schema.topics)
    .values({ label: parsed.data.label, description: parsed.data.description ?? null })
    .returning();
  return NextResponse.json({ topic: row }, { status: 201 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(schema.topics).where(eq(schema.topics.id, id));
  return NextResponse.json({ ok: true });
}
