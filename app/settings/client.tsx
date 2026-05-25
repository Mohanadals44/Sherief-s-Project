"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, RotateCcw, Loader2, AlertTriangle, Check, Terminal, RefreshCw, CheckCircle2 } from "lucide-react";

interface CliDetection {
  installed: boolean;
  binaryPath: string | null;
  version: string | null;
  loggedIn: boolean;
  loginError: string | null;
  models: Array<{ id: string; displayName: string; description?: string | null }>;
  modelsError: string | null;
}

export function SettingsClient({
  current,
  cli: initialCli,
  mode: initialMode,
  agentLabels,
  agentDescriptions,
  defaults,
}: {
  current: Record<string, string>;
  cli: CliDetection;
  mode: "cli" | "files";
  agentLabels: Record<string, string>;
  agentDescriptions: Record<string, string>;
  defaults: Record<string, string>;
}) {
  const [values, setValues] = useState(current);
  const [cli, setCli] = useState(initialCli);
  const [mode, setMode] = useState(initialMode);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();

  const modelOptions = (() => {
    const byId = new Map<string, { id: string; displayName: string }>();
    for (const m of cli.models) byId.set(m.id, m);
    for (const v of Object.values(values)) {
      if (!byId.has(v)) byId.set(v, { id: v, displayName: `${v} (configured, not verified yet)` });
    }
    for (const v of Object.values(defaults)) {
      if (!byId.has(v)) byId.set(v, { id: v, displayName: `${v} (default)` });
    }
    return Array.from(byId.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  })();

  const agents = Object.keys(agentLabels);

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ models: values }),
      });
      setNotice(res.ok ? "Saved." : "Error saving.");
    } finally {
      setSaving(false);
      setTimeout(() => setNotice(null), 3000);
    }
  }

  async function reset() {
    if (!confirm("Reset all agent models to defaults?")) return;
    setResetting(true);
    try {
      const res = await fetch("/api/settings", { method: "POST" });
      if (res.ok) {
        setValues({ ...defaults });
        setNotice("Reset to defaults.");
      }
    } finally {
      setResetting(false);
      setTimeout(() => setNotice(null), 3000);
    }
  }

  async function recheckCli() {
    setRechecking(true);
    try {
      const res = await fetch("/api/runtime", { method: "POST" });
      const body = await res.json();
      setCli(body.cli);
      setMode(body.mode);
      router.refresh();
    } finally {
      setRechecking(false);
    }
  }

  return (
    <div className="space-y-6">
      <div
        className={`card border ${
          mode === "cli"
            ? "border-[color-mix(in_oklab,var(--color-success)_30%,transparent)]"
            : "border-[color-mix(in_oklab,var(--color-warning)_30%,transparent)]"
        }`}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <Terminal size={16} />
              Execution mode: <code className="font-mono">{mode}</code>
              {mode === "cli" ? (
                <span className="inline-flex items-center gap-1 text-xs text-[var(--color-success)]">
                  <CheckCircle2 size={12} />
                  automated
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-[var(--color-warning)]">
                  <AlertTriangle size={12} />
                  prompt-pack files
                </span>
              )}
            </div>
            <div className="text-xs text-[var(--color-text-mute)] mt-1">
              {mode === "cli"
                ? `Runs are automated via the Cursor CLI at ${cli.binaryPath ?? "(unknown path)"}. Schedules fire on their own.`
                : "Runs write prompt-pack files to ./runs/<id>/. Open each in Cursor, paste the result back, and click Ingest."}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={recheckCli} disabled={rechecking}>
            {rechecking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Recheck
          </button>
        </div>

        {!cli.installed && (
          <div className="text-sm space-y-2 pt-3 border-t border-[var(--color-border)]">
            <div className="text-[var(--color-warning)] font-medium">Cursor CLI not installed</div>
            <div>Install with:</div>
            <pre className="bg-[var(--color-surface-2)] p-2 rounded text-xs overflow-x-auto">
{`curl https://cursor.com/install -fsS | bash`}
            </pre>
            <div>Then authenticate once:</div>
            <pre className="bg-[var(--color-surface-2)] p-2 rounded text-xs overflow-x-auto">{`agent login`}</pre>
            <div>Then click Recheck above. App will switch to automated CLI mode.</div>
          </div>
        )}
        {cli.installed && !cli.loggedIn && (
          <div className="text-sm space-y-2 pt-3 border-t border-[var(--color-border)]">
            <div className="text-[var(--color-warning)] font-medium">CLI installed but not logged in</div>
            <pre className="bg-[var(--color-surface-2)] p-2 rounded text-xs overflow-x-auto">{`agent login`}</pre>
            {cli.loginError && (
              <div className="text-xs text-[var(--color-text-mute)] font-mono">{cli.loginError}</div>
            )}
          </div>
        )}
        {cli.installed && cli.loggedIn && (
          <div className="text-xs text-[var(--color-text-mute)] pt-3 border-t border-[var(--color-border)] space-y-0.5 font-mono">
            <div>binary: {cli.binaryPath}</div>
            {cli.version && <div>version: {cli.version.split("\n")[0]}</div>}
            <div>models available: {cli.models.length}</div>
            {cli.modelsError && <div className="text-[var(--color-warning)]">models error: {cli.modelsError}</div>}
          </div>
        )}
      </div>

      <div className="card">
        <div className="mb-4">
          <h2 className="font-semibold">Model per agent</h2>
          <p className="text-xs text-[var(--color-text-mute)] mt-1">
            {mode === "cli"
              ? "Passed to the CLI via --model. Dropdown shows models available to your Cursor account."
              : "Suggested as the recommended model in each prompt pack - you can still pick anything in Cursor's chat dropdown when running."}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6">
          {agents.map((agent) => (
            <div key={agent} className="grid grid-cols-[1fr_minmax(280px,360px)] gap-4 items-start">
              <div>
                <div className="font-medium">{agentLabels[agent]}</div>
                <div className="text-xs text-[var(--color-text-mute)] mt-1">{agentDescriptions[agent]}</div>
                <div className="text-[11px] text-[var(--color-text-mute)] mt-1 font-mono">default: {defaults[agent]}</div>
              </div>
              <div>
                <select
                  className="input"
                  value={values[agent] ?? defaults[agent]}
                  onChange={(e) => setValues({ ...values, [agent]: e.target.value })}
                >
                  {modelOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
                <div className="text-[11px] text-[var(--color-text-mute)] mt-1 font-mono">
                  selected: {values[agent] ?? defaults[agent]}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center mt-6 pt-4 border-t border-[var(--color-border)]">
          <button className="btn btn-ghost" onClick={reset} disabled={resetting}>
            {resetting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Reset defaults
          </button>
          <div className="flex items-center gap-3">
            {notice && (
              <span className="inline-flex items-center gap-1 text-sm text-[var(--color-text-dim)]">
                <Check size={14} />
                {notice}
              </span>
            )}
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
