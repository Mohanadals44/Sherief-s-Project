"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Play, Loader2 } from "lucide-react";
import { formatRelative } from "@/lib/ui";
import type { Topic } from "@/lib/db/schema";

export function TopicsClient({ initial }: { initial: Topic[] }) {
  const [topics, setTopics] = useState<Topic[]>(initial);
  const [form, setForm] = useState({ label: "", description: "" });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  async function add() {
    if (adding) return;
    if (form.label.trim().length < 2) return;
    setAdding(true);
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: form.label.trim(), description: form.description.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) {
        alert(JSON.stringify(body.error ?? body));
        return;
      }
      setTopics((prev) => [body.topic, ...prev]);
      setForm({ label: "", description: "" });
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this topic? Associated reports will stay but lose their link.")) return;
    setTopics((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/topics?id=${id}`, { method: "DELETE" });
  }

  async function runNow(t: Topic) {
    setBusyId(t.id);
    try {
      await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "topic_research", topicId: t.id }),
      });
      setTimeout(() => {
        setBusyId(null);
        router.push("/");
      }, 600);
    } catch (err) {
      setBusyId(null);
      alert((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="font-semibold mb-3">New research topic</h3>
        <div className="space-y-2">
          <input
            className="input"
            placeholder="Research topic (e.g. US-China semiconductor policy)"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
          <textarea
            className="input min-h-[70px]"
            placeholder="Optional: additional data, notes, links, or context for the research prompt"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="flex justify-end">
            <button className="btn btn-primary" onClick={add} disabled={adding}>
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add topic
            </button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-3">
          Saved topics
        </h3>
        <div className="space-y-2">
          {topics.map((t) => (
            <div key={t.id} className="card flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{t.label}</div>
                {t.description && (
                  <div className="text-sm text-[var(--color-text-dim)] mt-1">{t.description}</div>
                )}
                <div className="text-xs text-[var(--color-text-mute)] mt-2">
                  Created {formatRelative(t.createdAt)}
                  {t.lastResearchedAt ? ` - last researched ${formatRelative(t.lastResearchedAt)}` : " - never researched"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-primary"
                  onClick={() => runNow(t)}
                  disabled={busyId === t.id}
                >
                  {busyId === t.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  Run now
                </button>
                <button
                  className="p-2 text-[var(--color-text-mute)] hover:text-[var(--color-danger)]"
                  onClick={() => remove(t.id)}
                  aria-label="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {topics.length === 0 && (
            <div className="text-sm text-[var(--color-text-mute)]">
              No topics saved yet. Add one above, or use "Research a topic" on the dashboard for a one-off run.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
