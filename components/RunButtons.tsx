"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Lightbulb, Loader2 } from "lucide-react";

export function RunDailyButton({ topicHint }: { topicHint?: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function go() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "daily_briefing", topicHint }),
      });
      setTimeout(() => {
        router.refresh();
        setBusy(false);
      }, 600);
    } catch (err) {
      setBusy(false);
      alert((err as Error).message);
    }
  }
  return (
    <button className="btn btn-primary" onClick={go} disabled={busy}>
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
      {busy ? "Queueing..." : "Run daily brief now"}
    </button>
  );
}

export function DeepDiveButton() {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function go() {
    if (busy || label.trim().length < 2) return;
    setBusy(true);
    try {
      await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "topic_research", topicLabel: label.trim() }),
      });
      setOpen(false);
      setLabel("");
      setTimeout(() => {
        router.refresh();
        setBusy(false);
      }, 600);
    } catch (err) {
      setBusy(false);
      alert((err as Error).message);
    }
  }
  return (
    <>
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        <Lightbulb size={14} />
        Research a topic
      </button>
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-6"
          onClick={() => !busy && setOpen(false)}
        >
          <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-1">Research a topic</h3>
            <p className="text-sm text-[var(--color-text-dim)] mb-3">
              The Deep Research, Daily Briefing, and Grok/Social agents will run in parallel, then the Synthesizer merges them.
            </p>
            <input
              autoFocus
              className="input"
              placeholder="e.g. US-China semiconductor policy"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && go()}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={go} disabled={busy || label.trim().length < 2}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {busy ? "Queueing..." : "Start research"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
