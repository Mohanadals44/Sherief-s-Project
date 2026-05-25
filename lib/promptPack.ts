import fs from "node:fs/promises";
import path from "node:path";
import { AGENT_LABELS, type AgentName } from "./config";

export const RESULT_MARKER = "<!-- PASTE RESULT BELOW THIS LINE -->";
const SYSTEM_OPEN = "<!-- SYSTEM START -->";
const SYSTEM_CLOSE = "<!-- SYSTEM END -->";
const PROMPT_OPEN = "<!-- PROMPT START -->";
const PROMPT_CLOSE = "<!-- PROMPT END -->";

export interface PromptPackInput {
  reportId: number;
  agent: AgentName;
  model: string;
  systemNote: string;
  prompt: string;
  stepLabels?: string[];
}

export interface PromptPackLocation {
  filePath: string;
  relativePath: string;
  dir: string;
}

export function promptPackDir(reportId: number): string {
  return path.join(process.cwd(), "runs", String(reportId));
}

export function promptPackPath(reportId: number, agent: AgentName): string {
  return path.join(promptPackDir(reportId), `${agent}.prompt.md`);
}

export async function writePromptPack(input: PromptPackInput): Promise<PromptPackLocation> {
  const dir = promptPackDir(input.reportId);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${input.agent}.prompt.md`);
  const relativePath = path.relative(process.cwd(), filePath);

  const stepsBlock = input.stepLabels && input.stepLabels.length > 0
    ? `\nThis agent expects **${input.stepLabels.length} steps** in the same Cursor chat (the model should keep context across turns):\n${input.stepLabels.map((l, i) => `  ${i + 1}. ${l}`).join("\n")}\n\nAfter the last step's output is ready, paste the **final output** (the last step's response) below the marker.\n`
    : "";

  const body = `# ${AGENT_LABELS[input.agent]} - prompt pack

- **Report ID:** ${input.reportId}
- **Agent:** \`${input.agent}\`
- **Recommended model:** \`${input.model}\` (pick this in Cursor's chat model dropdown before running)
${stepsBlock}
## How to run

1. Open this file in Cursor (already done if you're reading it here).
2. Open the Chat panel (\`Cmd+L\`).
3. Change the model in the dropdown to **${input.model}** (or any model you prefer).
4. Copy the **system prompt** below and paste it as your first message (prefixed with \`SYSTEM:\`), OR prepend it to the user prompt.
5. Copy the **user prompt** below and send it.
6. When the agent finishes, copy its final response and paste it below the \`PASTE RESULT BELOW THIS LINE\` marker at the bottom of this file. Save.
7. In the dashboard, click **Ingest results** on this report's pending card. The synthesizer will run automatically once all required agents are ingested.

${SYSTEM_OPEN}
${input.systemNote}
${SYSTEM_CLOSE}

${PROMPT_OPEN}
${input.prompt}
${PROMPT_CLOSE}

---

${RESULT_MARKER}

`;

  await fs.writeFile(filePath, body, "utf8");
  return { filePath, relativePath, dir };
}

export async function readResultFromPack(reportId: number, agent: AgentName): Promise<string | null> {
  const filePath = promptPackPath(reportId, agent);
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
  const idx = content.indexOf(RESULT_MARKER);
  if (idx === -1) return null;
  const tail = content.slice(idx + RESULT_MARKER.length).trim();
  if (!tail) return null;
  return tail;
}

export async function saveResultToPack(reportId: number, agent: AgentName, result: string): Promise<void> {
  const filePath = promptPackPath(reportId, agent);
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    await fs.mkdir(promptPackDir(reportId), { recursive: true });
    content = `# Manual result for ${agent} - report ${reportId}\n\n${RESULT_MARKER}\n\n`;
  }
  const idx = content.indexOf(RESULT_MARKER);
  if (idx === -1) {
    content = content + `\n\n${RESULT_MARKER}\n\n${result.trim()}\n`;
  } else {
    content = content.slice(0, idx + RESULT_MARKER.length) + "\n\n" + result.trim() + "\n";
  }
  await fs.writeFile(filePath, content, "utf8");
}

export interface PromptPackStatus {
  agent: AgentName;
  path: string;
  relativePath: string;
  exists: boolean;
  hasResult: boolean;
}

export async function listPackStatus(
  reportId: number,
  agents: AgentName[],
): Promise<PromptPackStatus[]> {
  const out: PromptPackStatus[] = [];
  for (const agent of agents) {
    const filePath = promptPackPath(reportId, agent);
    let exists = false;
    let hasResult = false;
    try {
      const content = await fs.readFile(filePath, "utf8");
      exists = true;
      const idx = content.indexOf(RESULT_MARKER);
      if (idx !== -1) {
        const tail = content.slice(idx + RESULT_MARKER.length).trim();
        hasResult = tail.length > 0;
      }
    } catch {
      exists = false;
    }
    out.push({
      agent,
      path: filePath,
      relativePath: path.relative(process.cwd(), filePath),
      exists,
      hasResult,
    });
  }
  return out;
}
