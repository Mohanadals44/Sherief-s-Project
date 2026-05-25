"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, Loader2, Search } from "lucide-react";
import type { Outlet } from "@/lib/db/schema";

export function OutletsClient({ initial }: { initial: Outlet[] }) {
  const [outlets, setOutlets] = useState<Outlet[]>(initial);
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const categories = useMemo(() => {
    const set = new Set<string>();
    outlets.forEach((o) => set.add(o.category));
    return ["all", ...Array.from(set).sort()];
  }, [outlets]);

  const filtered = useMemo(() => {
    return outlets.filter((o) => {
      if (category !== "all" && o.category !== category) return false;
      if (filter && !`${o.name} ${o.rssUrl}`.toLowerCase().includes(filter.toLowerCase())) return false;
      return true;
    });
  }, [outlets, filter, category]);

  async function toggle(id: number, enabled: boolean) {
    setOutlets((prev) => prev.map((o) => (o.id === id ? { ...o, enabled } : o)));
    await fetch("/api/outlets", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
  }

  async function remove(id: number) {
    if (!confirm("Delete this outlet?")) return;
    setOutlets((prev) => prev.filter((o) => o.id !== id));
    await fetch(`/api/outlets?id=${id}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  const [form, setForm] = useState({ name: "", rssUrl: "", category: "general" });
  const [adding, setAdding] = useState(false);
  async function add() {
    if (adding) return;
    if (!form.name || !form.rssUrl) return;
    setAdding(true);
    try {
      const res = await fetch("/api/outlets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json();
        alert(JSON.stringify(body.error ?? body));
        return;
      }
      const body = await res.json();
      setOutlets((prev) => [...prev, body.outlet].sort((a, b) => a.name.localeCompare(b.name)));
      setForm({ name: "", rssUrl: "", category: "general" });
    } finally {
      setAdding(false);
    }
  }

  const enabledCount = outlets.filter((o) => o.enabled).length;

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold">
              {enabledCount} enabled <span className="text-[var(--color-text-mute)] font-normal">of {outlets.length}</span>
            </h2>
            <p className="text-xs text-[var(--color-text-mute)]">
              Enabled outlets are pulled in parallel every time the Daily Briefing agent runs.
            </p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-mute)]" size={14} />
            <input
              className="input pl-9"
              placeholder="Search outlets..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <select
            className="input w-auto"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="divide-y divide-[var(--color-border)]">
          {filtered.map((o) => (
            <div key={o.id} className="py-3 flex items-center gap-4">
              <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                <button
                  type="button"
                  aria-pressed={o.enabled}
                  onClick={() => toggle(o.id, !o.enabled)}
                  className={`size-5 rounded border flex items-center justify-center transition-colors ${
                    o.enabled
                      ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-[#0b0d10]"
                      : "border-[var(--color-border-strong)]"
                  }`}
                >
                  {o.enabled && <Check size={14} strokeWidth={3} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{o.name}</div>
                  <div className="text-xs text-[var(--color-text-mute)] truncate">{o.rssUrl}</div>
                </div>
                <span className="text-[11px] uppercase tracking-wider text-[var(--color-text-mute)] bg-[var(--color-surface-2)] border border-[var(--color-border)] px-2 py-0.5 rounded">
                  {o.category}
                </span>
              </label>
              <button
                className="p-2 text-[var(--color-text-mute)] hover:text-[var(--color-danger)]"
                onClick={() => remove(o.id)}
                disabled={pending}
                aria-label="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="py-6 text-sm text-[var(--color-text-mute)] text-center">No outlets match your filter.</div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Add outlet</h3>
        <div className="grid grid-cols-[1fr_2fr_auto_auto] gap-2">
          <input
            className="input"
            placeholder="Name (e.g. Reuters - World)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input"
            placeholder="RSS URL"
            value={form.rssUrl}
            onChange={(e) => setForm({ ...form, rssUrl: e.target.value })}
          />
          <input
            className="input w-28"
            placeholder="category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <button className="btn btn-primary" onClick={add} disabled={adding}>
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add
          </button>
        </div>
        <p className="text-xs text-[var(--color-text-mute)] mt-2">
          Most outlets publish an RSS URL on their site - look for "RSS" in the footer or a common feed path (e.g. /feed/, /rss.xml).
        </p>
      </div>
    </div>
  );
}
