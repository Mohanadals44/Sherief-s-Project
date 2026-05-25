import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { DeepDiveButton, RunDailyButton } from "@/components/RunButtons";
import { formatRelative } from "@/lib/ui";
import { ArrowRight, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const reports = await db
    .select()
    .from(schema.reports)
    .orderBy(desc(schema.reports.createdAt))
    .limit(15);
  const latest = reports[0];
  const enabledOutlets = await db.select().from(schema.outlets);
  const topics = await db.select().from(schema.topics);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Multi-agent news & research that runs inside Cursor - no API key required"
        actions={
          <div className="flex items-center gap-2">
            <DeepDiveButton />
            <RunDailyButton />
          </div>
        }
      />
      <div className="p-8 space-y-8 max-w-6xl">
        <section className="grid grid-cols-3 gap-4">
          <div className="card">
            <div className="text-xs text-[var(--color-text-mute)] uppercase tracking-wider">Outlets enabled</div>
            <div className="mt-2 text-3xl font-semibold">
              {enabledOutlets.filter((o) => o.enabled).length}
              <span className="text-base font-normal text-[var(--color-text-mute)]"> / {enabledOutlets.length}</span>
            </div>
            <Link href="/outlets" className="text-xs text-[var(--color-accent)] mt-2 inline-flex items-center gap-1">
              Manage outlets <ArrowRight size={12} />
            </Link>
          </div>
          <div className="card">
            <div className="text-xs text-[var(--color-text-mute)] uppercase tracking-wider">Saved topics</div>
            <div className="mt-2 text-3xl font-semibold">{topics.length}</div>
            <Link href="/topics" className="text-xs text-[var(--color-accent)] mt-2 inline-flex items-center gap-1">
              Manage topics <ArrowRight size={12} />
            </Link>
          </div>
          <div className="card">
            <div className="text-xs text-[var(--color-text-mute)] uppercase tracking-wider">Reports generated</div>
            <div className="mt-2 text-3xl font-semibold">{reports.length > 15 ? "15+" : reports.length}</div>
            <Link href="#recent" className="text-xs text-[var(--color-accent)] mt-2 inline-flex items-center gap-1">
              See recent <ArrowRight size={12} />
            </Link>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-3">
            Latest report
          </h2>
          {latest ? (
            <Link
              href={`/reports/${latest.id}`}
              className="card block hover:border-[var(--color-border-strong)] transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText size={14} className="text-[var(--color-text-mute)]" />
                    <span className="text-[11px] uppercase tracking-wider text-[var(--color-text-mute)]">
                      {latest.kind.replace("_", " ")}
                    </span>
                    <StatusBadge status={latest.status} />
                  </div>
                  <div className="text-lg font-semibold">{latest.title}</div>
                  <div className="text-xs text-[var(--color-text-mute)] mt-1">
                    Created {formatRelative(latest.createdAt)}
                    {latest.completedAt && ` - completed ${formatRelative(latest.completedAt)}`}
                  </div>
                  {latest.error && (
                    <div className="mt-2 text-xs text-[var(--color-danger)]">Error: {latest.error}</div>
                  )}
                </div>
                <ArrowRight size={18} className="text-[var(--color-text-mute)] mt-1" />
              </div>
            </Link>
          ) : (
            <div className="card text-[var(--color-text-dim)]">
              No reports yet. Click "Run daily brief now" above to generate your first.
            </div>
          )}
        </section>

        <section id="recent">
          <h2 className="text-sm font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-3">
            Recent reports
          </h2>
          <div className="space-y-2">
            {reports.slice(1).map((r) => (
              <Link
                key={r.id}
                href={`/reports/${r.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <StatusBadge status={r.status} />
                    <span className="text-[11px] uppercase tracking-wider text-[var(--color-text-mute)]">
                      {r.kind.replace("_", " ")}
                    </span>
                  </div>
                  <div className="text-sm truncate">{r.title}</div>
                </div>
                <div className="text-xs text-[var(--color-text-mute)] shrink-0">{formatRelative(r.createdAt)}</div>
              </Link>
            ))}
            {reports.length <= 1 && (
              <div className="text-sm text-[var(--color-text-mute)]">No additional reports yet.</div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
