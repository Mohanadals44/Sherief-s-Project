import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, asc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRelative } from "@/lib/ui";
import { AGENT_LABELS, type AgentName } from "@/lib/config";
import { listPackStatus } from "@/lib/promptPack";
import { ReportBody, ReportRefresh, PendingRunPanel } from "./client";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rid = Number(id);
  if (!Number.isFinite(rid)) notFound();
  const report = await db.select().from(schema.reports).where(eq(schema.reports.id, rid)).get();
  if (!report) notFound();
  const runs = await db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.reportId, rid))
    .orderBy(asc(schema.runs.startedAt));

  const isRunningCli = report.status === "running" || report.status === "pending";
  const meta = (report.metadata ?? {}) as Record<string, unknown>;
  const requiredAgents = ((meta.requiredAgents as AgentName[] | undefined) ?? []).concat();
  const allAgents: AgentName[] = [...requiredAgents];
  if (report.status === "awaiting_synthesis" || report.status === "awaiting_upstream") {
    if (!allAgents.includes("synthesize") && report.status === "awaiting_synthesis") {
      allAgents.push("synthesize");
    }
  }
  const packStatuses = allAgents.length > 0 ? await listPackStatus(rid, allAgents) : [];

  return (
    <>
      <PageHeader
        title={report.title}
        subtitle={`${report.kind.replace("_", " ")} - created ${formatRelative(report.createdAt)}${
          report.completedAt ? ` - completed ${formatRelative(report.completedAt)}` : ""
        }`}
        actions={
          <Link href="/" className="btn btn-ghost">
            <ArrowLeft size={14} />
            Back
          </Link>
        }
      />
      {isRunningCli && <ReportRefresh />}
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 p-8 max-w-[1300px]">
        <div className="min-w-0">
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <StatusBadge status={report.status} />
            {report.error && <span className="text-sm text-[var(--color-danger)]">{report.error}</span>}
          </div>

          {(report.status === "awaiting_upstream" || report.status === "awaiting_synthesis") && (
            <PendingRunPanel
              reportId={rid}
              reportStatus={report.status}
              packs={packStatuses.map((p) => {
                const run = runs.find((r) => r.agentName === p.agent);
                return {
                  agent: p.agent,
                  label: AGENT_LABELS[p.agent],
                  path: p.relativePath,
                  exists: p.exists,
                  hasResult: p.hasResult,
                  modelId: run?.modelId ?? null,
                };
              })}
            />
          )}

          {report.markdown ? (
            <ReportBody markdown={report.markdown} />
          ) : (
            !["awaiting_upstream", "awaiting_synthesis"].includes(report.status) && (
              <div className="card text-[var(--color-text-dim)]">
                {isRunningCli
                  ? "Report is still generating. This page auto-refreshes every 5 seconds."
                  : "No content."}
              </div>
            )
          )}
        </div>
        <aside className="space-y-3">
          <h3 className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider">Agent runs</h3>
          {runs.map((r) => (
            <div key={r.id} className="card p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-sm font-medium">{AGENT_LABELS[r.agentName as AgentName] ?? r.agentName}</div>
                <StatusBadge status={r.status} />
              </div>
              <div className="text-[11px] text-[var(--color-text-mute)] space-y-0.5 font-mono">
                {r.modelId && <div>model: {r.modelId}</div>}
                {r.cursorAgentId && <div>agent: {r.cursorAgentId}</div>}
                {r.cursorRunId && <div>run: {r.cursorRunId}</div>}
                {typeof r.durationMs === "number" && <div>took: {(r.durationMs / 1000).toFixed(1)}s</div>}
              </div>
              {r.error && <div className="mt-2 text-xs text-[var(--color-danger)]">{r.error}</div>}
            </div>
          ))}
          {runs.length === 0 && <div className="text-xs text-[var(--color-text-mute)]">No runs recorded yet.</div>}
        </aside>
      </div>
    </>
  );
}
