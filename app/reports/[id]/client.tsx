"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, ClipboardPaste, FileText, Loader2, Play, Upload } from "lucide-react";
import type { AgentName } from "@/lib/config";

export function ReportBody({ markdown }: { markdown: string }) {
  return (
    <article className="prose-report">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer" /> }}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}

export function ReportRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

export interface PackInfo {
  agent: AgentName;
  label: string;
  path: string;
  exists: boolean;
  hasResult: boolean;
  modelId: string | null;
}

export function PendingRunPanel({
  reportId,
  reportStatus,
  packs,
}: {
  reportId: number;
  reportStatus: "awaiting_upstream" | "awaiting_synthesis" | string;
  packs: PackInfo[];
}) {
  return (
    <div className="mb-6 card border-[color-mix(in_oklab,var(--color-accent)_30%,transparent)]">
      <h2 className="font-semibold mb-1">Manual execution mode</h2>
      <p className="text-sm text-[var(--color-text-dim)] mb-4">
        {reportStatus === "awaiting_upstream"
          ? "The Cursor CLI isn't set up, so the orchestrator wrote prompt-pack files for each upstream agent. Open them in Cursor, run with the suggested model, paste the final response back here, then click Ingest."
          : "Upstream results ingested. Now run the synthesizer prompt pack and paste its final output below, then click Finalize."}
      </p>
      <div className="space-y-3">
        {packs.map((pack) => (
          <PackCard key={pack.agent} reportId={reportId} pack={pack} />
        ))}
      </div>
      <FooterActions reportId={reportId} reportStatus={reportStatus} packs={packs} />
    </div>
  );
}

function PackCard({ reportId, pack }: { reportId: number; pack: PackInfo }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(pack.hasResult);
  const router = useRouter();

  async function save() {
    if (text.trim().length === 0 || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/ingest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "paste", agent: pack.agent, result: text }),
      });
      if (res.ok) {
        setSaved(true);
        setText("");
        router.refresh();
      } else {
        const body = await res.json();
        alert(JSON.stringify(body.error ?? body));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <div className="text-sm font-medium flex items-center gap-2">
            <FileText size={14} className="text-[var(--color-text-mute)]" />
            {pack.label}
            {saved && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-success)]">
                <Check size={12} />
                pasted
              </span>
            )}
          </div>
          <div className="text-[11px] text-[var(--color-text-mute)] font-mono mt-0.5">
            {pack.path}
            {pack.modelId && <span className="ml-2">· model: {pack.modelId}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={() => navigator.clipboard.writeText(pack.path).catch(() => {})}
            title="Copy file path"
          >
            copy path
          </button>
        </div>
      </div>
      <textarea
        className="input min-h-[80px] font-mono text-xs"
        placeholder={
          saved
            ? "Already pasted. Paste a new value here to overwrite."
            : "Paste the final agent response here, then click Save. (Or paste directly into the .prompt.md file under the RESULT marker and save the file.)"
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex justify-end mt-2">
        <button className="btn btn-primary text-xs" onClick={save} disabled={saving || text.trim().length === 0}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : <ClipboardPaste size={12} />}
          Save result
        </button>
      </div>
    </div>
  );
}

function FooterActions({
  reportId,
  reportStatus,
  packs,
}: {
  reportId: number;
  reportStatus: string;
  packs: PackInfo[];
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const upstreamPacks = packs.filter((p) => p.agent !== "synthesize");
  const upstreamReady = upstreamPacks.length > 0 && upstreamPacks.every((p) => p.hasResult);
  const synthReady = packs.find((p) => p.agent === "synthesize")?.hasResult ?? false;

  async function ingest() {
    setBusy(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/ingest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "ingest" }),
      });
      const body = await res.json();
      if (body.missing && body.missing.length > 0) {
        alert(`Still waiting on results for: ${body.missing.join(", ")}`);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    setBusy(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/ingest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "finalize" }),
      });
      if (!res.ok) {
        const body = await res.json();
        alert(body.error ?? "finalize failed");
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-[var(--color-border)]">
      {reportStatus === "awaiting_upstream" && (
        <button className="btn btn-primary" onClick={ingest} disabled={busy || !upstreamReady}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Ingest & prepare synthesizer
        </button>
      )}
      {reportStatus === "awaiting_synthesis" && (
        <button className="btn btn-primary" onClick={finalize} disabled={busy || !synthReady}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          Finalize report
        </button>
      )}
    </div>
  );
}
