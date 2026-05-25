import { NextResponse } from "next/server";
import { detectCli, getExecutionMode, clearCliCache } from "@/lib/runtime";

export async function GET() {
  const [det, mode] = await Promise.all([detectCli(), getExecutionMode()]);
  return NextResponse.json({ mode, cli: det });
}

export async function POST() {
  clearCliCache();
  const [det, mode] = await Promise.all([detectCli({ force: true }), getExecutionMode()]);
  return NextResponse.json({ mode, cli: det });
}
