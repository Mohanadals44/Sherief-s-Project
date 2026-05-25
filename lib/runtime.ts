import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const execFileAsync = promisify(execFile);

export type ExecutionMode = "cli" | "files";

export interface CliDetection {
  installed: boolean;
  binaryPath: string | null;
  version: string | null;
  loggedIn: boolean;
  loginError: string | null;
  models: Array<{ id: string; displayName: string; description?: string | null }>;
  modelsError: string | null;
  detectedAt: number;
}

const STANDARD_PATHS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  path.join(os.homedir(), ".local/bin"),
  path.join(os.homedir(), ".cursor/bin"),
];

function resolveBinaryPath(): string | null {
  const extra = (process.env.CURSOR_AGENT_PATH ?? "").trim();
  if (extra) {
    if (fs.existsSync(extra)) return extra;
    const expanded = path.isAbsolute(extra) ? extra : path.resolve(extra);
    if (fs.existsSync(expanded)) return expanded;
  }
  for (const dir of STANDARD_PATHS) {
    const p = path.join(dir, "agent");
    if (fs.existsSync(p)) return p;
  }
  const envPath = process.env.PATH ?? "";
  for (const dir of envPath.split(":")) {
    if (!dir) continue;
    const p = path.join(dir, "agent");
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function getAgentBinary(): string | null {
  return resolveBinaryPath();
}

let cache: CliDetection | null = null;
const CACHE_TTL_MS = 60_000;

export async function detectCli(opts?: { force?: boolean }): Promise<CliDetection> {
  if (!opts?.force && cache && Date.now() - cache.detectedAt < CACHE_TTL_MS) return cache;
  const binary = resolveBinaryPath();
  const detection: CliDetection = {
    installed: !!binary,
    binaryPath: binary,
    version: null,
    loggedIn: false,
    loginError: null,
    models: [],
    modelsError: null,
    detectedAt: Date.now(),
  };
  if (!binary) {
    detection.loginError = "Cursor CLI ('agent') is not installed. Install with: curl https://cursor.com/install -fsS | bash";
    cache = detection;
    return detection;
  }
  try {
    const { stdout } = await execFileAsync(binary, ["--version"], { timeout: 7_000 });
    detection.version = stdout.trim();
  } catch (err) {
    detection.version = null;
    detection.loginError = `agent --version failed: ${(err as Error).message}`;
  }
  // Step 1: check auth via `agent status` (designed for this, reliable exit codes).
  // Note: `--output-format json` ONLY works with `--print/-p`, not with subcommands.
  // So we parse plain-text status output.
  try {
    const { stdout, stderr } = await execFileAsync(binary, ["status"], { timeout: 10_000 });
    const combined = stdout + "\n" + stderr;
    if (/auth(entication)?\s+required|not logged in|please log in|unauthor|not authenticated/i.test(combined)) {
      detection.loggedIn = false;
      detection.loginError = "Cursor CLI is installed but not logged in. Run 'agent login' once.";
    } else {
      // Contains an email address or explicit logged-in message → authenticated.
      detection.loggedIn = /@|logged.?in|authenticated/i.test(combined);
      if (!detection.loggedIn) {
        // Ambiguous output: treat as logged in and let the models call be the final arbiter.
        detection.loggedIn = true;
      }
    }
  } catch (err) {
    // Non-zero exit from `agent status` usually means not authenticated.
    detection.loggedIn = false;
    detection.loginError = `agent status failed: ${(err as Error).message}. Run 'agent login' once.`;
  }

  // Step 2: if logged in, list models via `agent models` (plain-text subcommand, no --output-format needed).
  if (detection.loggedIn) {
    try {
      const { stdout, stderr } = await execFileAsync(binary, ["models"], { timeout: 15_000 });
      const combined = stdout + "\n" + stderr;
      if (/auth(entication)?\s+required|not logged in|please log in|unauthor/i.test(combined)) {
        detection.loggedIn = false;
        detection.loginError = "Cursor CLI is installed but not logged in. Run 'agent login' once.";
      } else {
        // Plain-text list: one model per line (possibly "  id  - display name" or just "id").
        const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
        detection.models = lines
          .map((line) => {
            // Handle formats: "model-id", "model-id - Display Name", "  model-id"
            const match = line.match(/^([a-z0-9][a-z0-9\-_.:/]+(?:\s+[a-z0-9][a-z0-9\-_.:/]+)?)/i);
            if (!match) return null;
            const id = match[1].trim();
            const displayPart = line.slice(match[1].length).replace(/^[\s\-–—:]+/, "").trim();
            return { id, displayName: displayPart || id, description: null };
          })
          .filter((m): m is { id: string; displayName: string; description: null } => !!m && m.id.length > 1);
        if (detection.models.length === 0) {
          detection.modelsError = "agent models returned no entries - models list will be empty. Agents will still use configured model IDs.";
        }
      }
    } catch (err) {
      detection.modelsError = `agent models failed: ${(err as Error).message}. Agents will still use configured model IDs.`;
    }
  }
  cache = detection;
  return detection;
}

export function clearCliCache(): void {
  cache = null;
}

export async function getExecutionMode(): Promise<ExecutionMode> {
  const forced = (process.env.CURSOR_EXECUTION_MODE ?? "").toLowerCase();
  if (forced === "cli") return "cli";
  if (forced === "files") return "files";
  const det = await detectCli();
  return det.installed && det.loggedIn ? "cli" : "files";
}
