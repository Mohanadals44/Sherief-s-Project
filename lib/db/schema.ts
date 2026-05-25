import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const outlets = sqliteTable("outlets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  rssUrl: text("rss_url").notNull(),
  category: text("category").notNull().default("general"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const topics = sqliteTable("topics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  lastResearchedAt: integer("last_researched_at", { mode: "timestamp_ms" }),
});

export const schedules = sqliteTable("schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["daily_briefing", "topic_research"] }).notNull(),
  topicId: integer("topic_id").references(() => topics.id, { onDelete: "cascade" }),
  cronExpr: text("cron_expr").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
  nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const reports = sqliteTable("reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["daily_briefing", "topic_research"] }).notNull(),
  topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  markdown: text("markdown").notNull().default(""),
  status: text("status", {
    enum: ["pending", "running", "awaiting_upstream", "awaiting_synthesis", "done", "error"],
  })
    .notNull()
    .default("pending"),
  error: text("error"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

export const runs = sqliteTable("runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reportId: integer("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  agentName: text("agent_name", {
    enum: ["dailyBriefing", "deepResearch", "socialGrok", "synthesize"],
  }).notNull(),
  cursorAgentId: text("cursor_agent_id"),
  cursorRunId: text("cursor_run_id"),
  modelId: text("model_id"),
  status: text("status", {
    enum: ["pending", "running", "awaiting_manual", "done", "error"],
  })
    .notNull()
    .default("pending"),
  startedAt: integer("started_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  endedAt: integer("ended_at", { mode: "timestamp_ms" }),
  durationMs: integer("duration_ms"),
  error: text("error"),
  output: text("output"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type Outlet = typeof outlets.$inferSelect;
export type NewOutlet = typeof outlets.$inferInsert;
export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;
export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;
export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type Setting = typeof settings.$inferSelect;
