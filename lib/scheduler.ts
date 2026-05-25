import cron, { type ScheduledTask } from "node-cron";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { runDailyBriefing, runTopicResearch } from "./orchestrator";

type Task = ScheduledTask;

const active = new Map<number, Task>();

export function isCronValid(expr: string): boolean {
  return cron.validate(expr);
}

export async function loadAll(): Promise<void> {
  clearAll();
  const rows = await db.select().from(schema.schedules).where(eq(schema.schedules.enabled, true));
  for (const row of rows) {
    registerInMemory(row);
  }
  console.log(`[scheduler] registered ${active.size} schedule(s)`);
}

function registerInMemory(row: typeof schema.schedules.$inferSelect) {
  if (!cron.validate(row.cronExpr)) {
    console.warn(`[scheduler] invalid cron expr on schedule ${row.id}: ${row.cronExpr}`);
    return;
  }
  const task = cron.schedule(
    row.cronExpr,
    async () => {
      try {
        await db
          .update(schema.schedules)
          .set({ lastRunAt: new Date() })
          .where(eq(schema.schedules.id, row.id));
        if (row.kind === "daily_briefing") {
          console.log(`[scheduler] firing daily_briefing for schedule ${row.id}`);
          await runDailyBriefing();
        } else if (row.kind === "topic_research" && row.topicId) {
          console.log(`[scheduler] firing topic_research for schedule ${row.id} topic=${row.topicId}`);
          await runTopicResearch(row.topicId);
        } else {
          console.warn(`[scheduler] schedule ${row.id} is topic_research but has no topicId`);
        }
      } catch (err) {
        console.error(`[scheduler] schedule ${row.id} run failed:`, err);
      }
    },
    { timezone: process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone },
  );
  active.set(row.id, task);
}

export async function registerOne(id: number): Promise<void> {
  unregisterOne(id);
  const row = await db.select().from(schema.schedules).where(eq(schema.schedules.id, id)).get();
  if (!row || !row.enabled) return;
  registerInMemory(row);
}

export function unregisterOne(id: number): void {
  const t = active.get(id);
  if (t) {
    t.stop();
    active.delete(id);
  }
}

export function clearAll(): void {
  for (const [, task] of active) task.stop();
  active.clear();
}

export function activeCount(): number {
  return active.size;
}
