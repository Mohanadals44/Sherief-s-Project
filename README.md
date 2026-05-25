# AI News Orchestration

A local-first Next.js app that orchestrates four news agents - Daily Briefing, Deep Research, Grok-on-X, Synthesizer - and runs each one inside **your Cursor** (no API keys, no external LLM bills). Every agent has its own recommended model which you can override per-agent from the Settings page.

## How it runs (two modes)

The app auto-detects which mode to use at startup.

**CLI mode (automated)** - if the [Cursor CLI](https://cursor.com/docs/cli/overview) (`agent`) is installed and you're logged in, the orchestrator shells out to `agent -p "<prompt>" --model <id> --output-format json -f`, parses the response, and fills the report automatically. Schedules fire on their own.

**Prompt-pack mode (manual)** - if the CLI isn't available, the orchestrator writes four markdown files per run to `./runs/<reportId>/<agent>.prompt.md` with the full prompt and recommended model. You open each file in Cursor, pick a model, run it, paste the response back below the marker, and click Ingest in the dashboard. The synthesizer is handled as a second manual step.

Neither mode needs a `CURSOR_API_KEY`. You don't need a Business plan.

## Agent defaults

| Agent | Default model | What it does |
| --- | --- | --- |
| Daily Briefing | Gemini 3 Pro | Reads RSS from configured outlets, produces a structured digest. |
| Deep Research | Claude Opus 4.5 | Three-step plan-gather-synthesize loop (single chat, multi-turn via `agent --resume`). |
| Social (Grok) | Grok 4 Fast Reasoning | Grok's native X/live-web search for sentiment and notable posts. |
| Synthesizer | GPT-5 | Merges the three streams into a final report. |

All four are configurable per-agent from **Settings** - dropdown is populated from `agent --list-models`.

## Prerequisites

- **Node 20+** (tested on 22.x).
- **Cursor CLI** (optional but recommended). Install:
  ```bash
  curl https://cursor.com/install -fsS | bash
  agent login
  ```
  Then run `agent status` to verify. If skipped, the app runs in prompt-pack mode instead.

## Setup

```bash
cp .env.local.example .env.local   # optional - file is a safe default
npm install
npm run db:push                    # creates data/app.db with schema
npm run db:seed                    # seeds ~22 outlets + model defaults + a disabled daily schedule
npm run dev                        # http://localhost:3000
```

## Using the app

1. **Dashboard** (`/`) - kick off a daily briefing or topic research, open past reports.
2. **Outlets** (`/outlets`) - toggle any of the 22 seeded feeds, filter by category, add custom RSS URLs.
3. **Topics** (`/topics`) - save topics you care about; run them on-demand or attach a schedule.
4. **Schedule** (`/schedule`) - cron schedules. Only fire while this machine is awake (`node-cron` doesn't backfill).
5. **Settings** (`/settings`) - shows the detected execution mode with setup instructions when in files mode, and per-agent model dropdowns.
6. **Report viewer** (`/reports/<id>`):
   - CLI mode: live-refreshes until done, shows each agent's run ID / model / duration.
   - Files mode: shows a "Manual execution" panel with each pending prompt-pack file, a textarea to paste results into, and Ingest + Finalize buttons.

## Prompt-pack workflow (files mode, step-by-step)

1. Click **Run daily brief now** or **Research a topic** on the dashboard.
2. The orchestrator fetches RSS, writes prompt packs under `./runs/<id>/`, and shows a "Manual execution" panel on the report page.
3. Open each `<agent>.prompt.md` in Cursor. The file explains exactly which model to pick and what to paste.
4. Run the prompt in Cursor's chat panel (Cmd+L).
5. Copy the response and either:
   - paste it below the `<!-- PASTE RESULT BELOW THIS LINE -->` marker in the `.md` file and save, or
   - paste it into the textarea on the report page and click **Save result**.
6. When all upstream agents are pasted, click **Ingest & prepare synthesizer**. A new `synthesize.prompt.md` is generated with the upstream outputs plugged in.
7. Run that in Cursor, paste its result, click **Finalize report**. Done.

## Key files

- Execution mode detection: [lib/runtime.ts](lib/runtime.ts)
- CLI wrapper + prompt/multi-step plumbing: [lib/agents/cursor.ts](lib/agents/cursor.ts)
- Orchestrator (branches CLI vs files): [lib/orchestrator.ts](lib/orchestrator.ts)
- Prompt-pack writer/reader: [lib/promptPack.ts](lib/promptPack.ts)
- RSS fetcher: [lib/rss.ts](lib/rss.ts)
- Scheduler: [lib/scheduler.ts](lib/scheduler.ts) + [instrumentation.ts](instrumentation.ts)
- Agent definitions: [lib/agents/dailyBriefing.ts](lib/agents/dailyBriefing.ts), [lib/agents/deepResearch.ts](lib/agents/deepResearch.ts), [lib/agents/socialGrok.ts](lib/agents/socialGrok.ts), [lib/agents/synthesize.ts](lib/agents/synthesize.ts)

## Env vars

All optional:

| Var | Purpose |
| --- | --- |
| `CURSOR_EXECUTION_MODE` | Force `cli`, `files`, or leave unset for `auto`. |
| `CURSOR_AGENT_PATH` | Path to the `agent` binary if auto-detect misses. |
| `DATABASE_URL` | SQLite file path (default `./data/app.db`). |

## Troubleshooting

- **Settings page shows "Cursor CLI not installed"**: you're in prompt-pack mode. Either install the CLI (see Prerequisites) or continue in manual mode; nothing breaks.
- **`agent` is installed but "not logged in"**: run `agent login` in a terminal once.
- **Schedules not firing**: `node-cron` only fires while `npm run dev` is running and your Mac is awake. Check the schedule is enabled on `/schedule`.
- **RSS feed keeps failing**: some outlets block automated requests; swap in a mirror (e.g. Bloomberg -> `rsshub.app/bloomberg/...`) or disable that outlet.
- **CLI run returns empty output**: check `--list-models` contains the model ID you picked; a typo in a model ID will cause the CLI to error with a misleading message.
