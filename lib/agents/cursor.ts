import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { AGENT_NAMES, DEFAULT_MODEL_BY_AGENT, modelSettingKey, type AgentName } from "../config";
import { detectCli, getAgentBinary } from "../runtime";

export interface RunAgentInput {
  agent: AgentName;
  prompt: string;
  systemNote?: string;
  modelId?: string;
  onResolved?: (info: { cursorAgentId: string; cursorRunId: string; modelId: string }) => void | Promise<void>;
}

export interface RunAgentResult {
  output: string;
  modelId: string;
  cursorAgentId: string;
  cursorRunId: string;
  durationMs: number;
}

export class CliNotAvailableError extends Error {
  readonly code = "CLI_NOT_AVAILABLE";
  constructor(message: string) {
    super(message);
  }
}

export class AgentStartupError extends Error {
  readonly kind = "startup" as const;
  readonly isRetryable: boolean;
  constructor(message: string, opts: { isRetryable?: boolean; cause?: unknown } = {}) {
    super(message);
    this.isRetryable = opts.isRetryable ?? false;
    if (opts.cause) (this as { cause?: unknown }).cause = opts.cause;
  }
}

export class AgentRunError extends Error {
  readonly kind = "run" as const;
  constructor(message: string, opts: { cause?: unknown } = {}) {
    super(message);
    if (opts.cause) (this as { cause?: unknown }).cause = opts.cause;
  }
}

export async function resolveModelForAgent(agent: AgentName): Promise<string> {
  const row = await db.select().from(schema.settings).where(eq(schema.settings.key, modelSettingKey(agent))).get();
  return row?.value ?? DEFAULT_MODEL_BY_AGENT[agent];
}

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

async function runCli(binary: string, args: string[], opts: { timeoutMs: number; input?: string }): Promise<CliResult> {
  return new Promise<CliResult>((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c) => (stdout += c.toString()));
    child.stderr?.on("data", (c) => (stderr += c.toString()));
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      try {
        child.kill("SIGKILL");
      } catch {}
      reject(new Error(`agent CLI timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);
    child.once("error", (err) => {
      finished = true;
      clearTimeout(timer);
      reject(err);
    });
    child.once("close", (code) => {
      finished = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });
    if (opts.input && child.stdin) {
      child.stdin.write(opts.input);
      child.stdin.end();
    } else if (child.stdin) {
      child.stdin.end();
    }
  });
}

function extractText(cliJson: string): { text: string; agentChatId: string | null; runId: string | null } {
  const trimmed = cliJson.trim();
  if (!trimmed) return { text: "", agentChatId: null, runId: null };
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const text =
      (typeof parsed.result === "string" && parsed.result) ||
      (typeof parsed.output === "string" && parsed.output) ||
      (typeof parsed.text === "string" && parsed.text) ||
      (typeof parsed.response === "string" && parsed.response) ||
      (typeof parsed.answer === "string" && parsed.answer) ||
      "";
    const agentChatId =
      (typeof parsed.chatId === "string" && parsed.chatId) ||
      (typeof parsed.chat_id === "string" && parsed.chat_id) ||
      (typeof parsed.sessionId === "string" && parsed.sessionId) ||
      null;
    const runId =
      (typeof parsed.runId === "string" && parsed.runId) ||
      (typeof parsed.run_id === "string" && parsed.run_id) ||
      null;
    if (text) return { text: String(text), agentChatId, runId };
    return { text: trimmed, agentChatId, runId };
  } catch {
    return { text: trimmed, agentChatId: null, runId: null };
  }
}

function formatPrompt(prompt: string, systemNote?: string): string {
  if (!systemNote) return prompt;
  return `${systemNote}\n\n---\n\n${prompt}`;
}

export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const det = await detectCli();
  if (!det.installed || !det.loggedIn) {
    throw new CliNotAvailableError(
      det.loginError ??
        "Cursor CLI is not installed or not logged in. Install with 'curl https://cursor.com/install -fsS | bash' then 'agent login'.",
    );
  }
  const binary = getAgentBinary();
  if (!binary) throw new CliNotAvailableError("agent binary not found on PATH");
  const modelId = input.modelId ?? (await resolveModelForAgent(input.agent));
  const prompt = formatPrompt(input.prompt, input.systemNote);
  const pseudoAgentId = `cli-${randomUUID().slice(0, 8)}`;
  const pseudoRunId = `cli-run-${randomUUID().slice(0, 8)}`;
  const started = Date.now();

  if (input.onResolved) {
    await input.onResolved({ cursorAgentId: pseudoAgentId, cursorRunId: pseudoRunId, modelId });
  }

  const args = [
    "-p",
    prompt,
    "--model",
    modelId,
    "--output-format",
    "json",
    "-f",
    "--workspace",
    process.cwd(),
  ];

  console.log(`[${input.agent}] launching CLI: agent --model ${modelId} (workspace=${process.cwd()})`);

  let res: CliResult;
  try {
    res = await runCli(binary, args, { timeoutMs: 20 * 60 * 1000 });
  } catch (err) {
    throw new AgentStartupError(`[${input.agent}] agent CLI failed to spawn: ${(err as Error).message}`, {
      cause: err,
    });
  }
  if (res.exitCode !== 0) {
    throw new AgentRunError(
      `[${input.agent}] agent CLI exited with code ${res.exitCode}: ${res.stderr.trim() || res.stdout.trim().slice(0, 500)}`,
    );
  }
  const { text, agentChatId, runId } = extractText(res.stdout);
  if (!text) {
    throw new AgentRunError(`[${input.agent}] agent CLI returned empty output. stderr=${res.stderr.slice(0, 300)}`);
  }
  return {
    output: text,
    modelId,
    cursorAgentId: agentChatId ?? pseudoAgentId,
    cursorRunId: runId ?? pseudoRunId,
    durationMs: Date.now() - started,
  };
}

export interface MultiStepInput {
  agent: AgentName;
  steps: Array<{ label: string; prompt: string }>;
  systemNote?: string;
  modelId?: string;
  onResolved?: (info: { cursorAgentId: string; cursorRunId: string; modelId: string }) => void | Promise<void>;
}

export interface MultiStepResult {
  final: string;
  steps: Array<{ label: string; output: string }>;
  modelId: string;
  cursorAgentId: string;
  cursorRunId: string;
  durationMs: number;
}

async function createChatId(binary: string): Promise<string | null> {
  try {
    const res = await runCli(binary, ["create-chat", "--output-format", "json"], { timeoutMs: 10_000 });
    if (res.exitCode !== 0) return null;
    const trimmed = res.stdout.trim();
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const id =
        (typeof parsed.chatId === "string" && parsed.chatId) ||
        (typeof parsed.chat_id === "string" && parsed.chat_id) ||
        (typeof parsed.id === "string" && parsed.id) ||
        null;
      return id;
    } catch {
      return trimmed.length > 0 ? trimmed.split(/\s+/)[0] : null;
    }
  } catch {
    return null;
  }
}

export async function runMultiStepAgent(input: MultiStepInput): Promise<MultiStepResult> {
  if (input.steps.length === 0) throw new Error("runMultiStepAgent requires at least one step");
  const det = await detectCli();
  if (!det.installed || !det.loggedIn) {
    throw new CliNotAvailableError(
      det.loginError ?? "Cursor CLI is not installed or not logged in.",
    );
  }
  const binary = getAgentBinary();
  if (!binary) throw new CliNotAvailableError("agent binary not found on PATH");
  const modelId = input.modelId ?? (await resolveModelForAgent(input.agent));
  const started = Date.now();
  const pseudoRunId = `cli-run-${randomUUID().slice(0, 8)}`;

  const chatId = await createChatId(binary);
  const logicalChatId = chatId ?? `cli-chat-${randomUUID().slice(0, 8)}`;
  if (input.onResolved) {
    await input.onResolved({ cursorAgentId: logicalChatId, cursorRunId: pseudoRunId, modelId });
  }

  const outputs: Array<{ label: string; output: string }> = [];
  for (let i = 0; i < input.steps.length; i++) {
    const step = input.steps[i];
    const promptText = i === 0 ? formatPrompt(step.prompt, input.systemNote) : step.prompt;
    const args: string[] = [
      "-p",
      promptText,
      "--model",
      modelId,
      "--output-format",
      "json",
      "-f",
      "--workspace",
      process.cwd(),
    ];
    if (chatId) args.push("--resume", chatId);
    console.log(`[${input.agent}] step=${step.label} chatId=${chatId ?? "(none)"}`);
    const res = await runCli(binary, args, { timeoutMs: 20 * 60 * 1000 });
    if (res.exitCode !== 0) {
      throw new AgentRunError(
        `[${input.agent}] step '${step.label}' CLI exited ${res.exitCode}: ${res.stderr.trim() || res.stdout.trim().slice(0, 500)}`,
      );
    }
    const { text } = extractText(res.stdout);
    outputs.push({ label: step.label, output: text });
  }

  return {
    final: outputs[outputs.length - 1]?.output ?? "",
    steps: outputs,
    modelId,
    cursorAgentId: logicalChatId,
    cursorRunId: pseudoRunId,
    durationMs: Date.now() - started,
  };
}

export async function warmStartupChecks(): Promise<{ ok: boolean; message: string }> {
  const det = await detectCli({ force: true });
  if (!det.installed) {
    return {
      ok: false,
      message:
        "Cursor CLI ('agent') not found. App will run in prompt-pack mode. Install CLI with: curl https://cursor.com/install -fsS | bash",
    };
  }
  if (!det.loggedIn) {
    return {
      ok: false,
      message: `Cursor CLI installed at ${det.binaryPath} but not logged in. Run 'agent login' once. Detail: ${det.loginError ?? "(no message)"}`,
    };
  }
  return {
    ok: true,
    message: `Cursor CLI ${det.version ?? "(version unknown)"} ready. ${det.models.length} models available. Configured defaults: ${AGENT_NAMES.map(
      (n) => `${n}=${DEFAULT_MODEL_BY_AGENT[n]}`,
    ).join(", ")}`,
  };
}

export async function listAvailableModels(): Promise<Array<{ id: string; displayName: string; description?: string | null }>> {
  const det = await detectCli();
  return det.models;
}

export function isCliNotAvailable(err: unknown): err is CliNotAvailableError {
  return err instanceof CliNotAvailableError;
}
export function isStartupError(err: unknown): err is AgentStartupError {
  return err instanceof AgentStartupError;
}
export function isRunError(err: unknown): err is AgentRunError {
  return err instanceof AgentRunError;
}
