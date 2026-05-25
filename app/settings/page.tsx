import { PageHeader } from "@/components/PageHeader";
import { SettingsClient } from "./client";
import { AGENT_NAMES, AGENT_LABELS, AGENT_DESCRIPTIONS, DEFAULT_MODEL_BY_AGENT, modelSettingKey } from "@/lib/config";
import { db, schema } from "@/lib/db";
import { detectCli, getExecutionMode } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const rows = await db.select().from(schema.settings);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  const current: Record<string, string> = {};
  for (const a of AGENT_NAMES) current[a] = map[modelSettingKey(a)] ?? DEFAULT_MODEL_BY_AGENT[a];

  const [cli, mode] = await Promise.all([detectCli({ force: true }), getExecutionMode()]);

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Execution mode and per-agent model picks. All runs use your Cursor login - no API key needed."
      />
      <div className="p-8 max-w-3xl">
        <SettingsClient
          current={current}
          cli={cli}
          mode={mode}
          agentLabels={AGENT_LABELS}
          agentDescriptions={AGENT_DESCRIPTIONS}
          defaults={DEFAULT_MODEL_BY_AGENT}
        />
      </div>
    </>
  );
}
