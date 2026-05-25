import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export async function GET() {
  const rows = await db.select().from(schema.outlets).orderBy(schema.outlets.name);
  return NextResponse.json({ outlets: rows });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  rssUrl: z.string().url(),
  category: z.string().min(1).max(40).default("general"),
  enabled: z.boolean().optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  const [row] = await db
    .insert(schema.outlets)
    .values({
      name: parsed.data.name,
      rssUrl: parsed.data.rssUrl,
      category: parsed.data.category,
      enabled: parsed.data.enabled ?? true,
    })
    .returning();
  return NextResponse.json({ outlet: row }, { status: 201 });
}

const PatchSchema = z.object({
  id: z.number().int(),
  enabled: z.boolean().optional(),
  name: z.string().min(1).max(120).optional(),
  rssUrl: z.string().url().optional(),
  category: z.string().min(1).max(40).optional(),
});

export async function PATCH(req: Request) {
  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  const { id, ...rest } = parsed.data;
  const [row] = await db.update(schema.outlets).set(rest).where(eq(schema.outlets.id, id)).returning();
  return NextResponse.json({ outlet: row });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(schema.outlets).where(eq(schema.outlets.id, id));
  return NextResponse.json({ ok: true });
}
