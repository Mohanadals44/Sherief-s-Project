import { NextResponse } from "next/server";
import { listAvailableModels } from "@/lib/agents/cursor";

export async function GET() {
  try {
    const models = await listAvailableModels();
    return NextResponse.json({
      models: models.map((m) => ({ id: m.id, displayName: m.displayName, description: m.description ?? null })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, models: [] },
      { status: 200 },
    );
  }
}
