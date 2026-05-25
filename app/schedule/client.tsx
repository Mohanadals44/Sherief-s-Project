"use client";

import { useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { formatRelative } from "@/lib/ui";
import type { Topic } from "@/lib/db/schema";

interface ScheduleRow {
  id: number;
  kind: "daily_briefing" | "topic_research";
  topicId: number | null;
  topicLabel: string | null;
  cronExpr: string;
  enabled: boolean;
  lastRunAt: Date | number | null;
  createdAt: Date | number;
}

const PRESETS: Array<{ label: string; cron: string }> = [
  { label: "Every day - 7:00 AM", cron: "0 7 * * *" },
  { label: "Every day - 6:00 PM", cron: "0 18 * * *" },
  { label: "Twice daily (7am & 6pm)", cron: "0 7,18 * * *" },
  { label: "Every weekday - 8:00 AM", cron: "0 8 * * 1-5" },
  { label: "Every Monday - 9:00 AM", cron: "0 9 * * 1" },
  { label: "Every 3 hours", cron: "0 */3 * * *" },
];

export function SchedulesClient({ initial, topics }: { initial: ScheduleRow[]; topics: Topic[] }) {
  const [schedules, setSchedules] = useState<ScheduleRow[]>(initial);
  const [form, setForm] = useState({
    kind: "daily_briefing" as "daily_briefing" | "topic_research",
    topicId: "" as string | number,
    cronExpr: "0 7 * * *",
    enabled: true,
  });
  const [adding, setAdding] = useState(false);

  async function add() {
    if (adding) return;
    setAdding(true);
    try {
      const body = {
        kind: form.kind,
        cronExpr: form.cronExpr,
        enabled: form.enabled,
        topicId: form.kind === "topic_research" ? Number(form.topicId) : undefined,
      };
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(JSON.stringify(data.error ?? data));
        return;
      }
      const topic = topics.find((t) => t.id === data.schedule.topicId);
      setSchedules((prev) => [{ ...data.schedule, topicLabel: topic?.label ?? null }, ...prev]);
    } finally {
      setAdding(false);
    }
  }

  async function toggle(id: number, enabled: boolean) {
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
    await fetch("/api/schedules", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
  }

  async function remove(id: number) {
    if (!confirm("Delete schedule?")) return;
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    await fetch(`/api/schedules?id=${id}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="font-semibold mb-3">Add schedule</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-xs text-[var(--color-text-mute)]">Kind</div>
            <select
              className="input"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as "daily_briefing" | "topic_research" })}
            >
              <option value="daily_briefing">Daily briefing</option>
              <option value="topic_research">Topic research</option>
            </select>
          </label>
          {form.kind === "topic_research" && (
            <label className="space-y-1">
              <div className="text-xs text-[var(--color-text-mute)]">Topic</div>
              <select
                className="input"
                value={form.topicId}
                onChange={(e) => setForm({ ...form, topicId: e.target.value })}
              >
                <option value="">Pick a topic...</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="col-span-2 space-y-1">
            <div className="text-xs text-[var(--color-text-mute)]">Cron expression</div>
            <input
              className="input font-mono"
              value={form.cronExpr}
              onChange={(e) => setForm({ ...form, cronExpr: e.target.value })}
              placeholder="0 7 * * *"
            />
            <div className="flex flex-wrap gap-1 mt-1">
              {PRESETS.map((p) => (
                <button
                  key={p.cron}
                  type="button"
                  onClick={() => setForm({ ...form, cronExpr: p.cron })}
                  className="text-[11px] px-2 py-0.5 rounded border border-[var(--color-border)] hover:border-[var(--color-border-strong)] text-[var(--color-text-dim)]"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </label>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            Enabled
          </label>
        </div>
        <div className="flex justify-end mt-3">
          <button
            className="btn btn-primary"
            onClick={add}
            disabled={adding || (form.kind === "topic_research" && !form.topicId)}
          >
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add schedule
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-3">
          Active schedules
        </h3>
        <div className="space-y-2">
          {schedules.map((s) => (
            <div key={s.id} className="card flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium">
                  {s.kind === "daily_briefing" ? "Daily briefing" : `Topic: ${s.topicLabel ?? `#${s.topicId}`}`}
                </div>
                <div className="text-xs text-[var(--color-text-mute)] font-mono mt-0.5">{s.cronExpr}</div>
                <div className="text-xs text-[var(--color-text-mute)] mt-0.5">
                  {s.lastRunAt ? `Last ran ${formatRelative(s.lastRunAt)}` : "Never ran yet"}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={s.enabled} onChange={(e) => toggle(s.id, e.target.checked)} />
                Enabled
              </label>
              <button
                className="p-2 text-[var(--color-text-mute)] hover:text-[var(--color-danger)]"
                onClick={() => remove(s.id)}
                aria-label="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {schedules.length === 0 && (
            <div className="text-sm text-[var(--color-text-mute)]">No schedules yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
