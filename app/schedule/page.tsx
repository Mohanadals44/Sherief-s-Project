import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { SchedulesClient } from "./client";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const schedules = await db
    .select({
      id: schema.schedules.id,
      kind: schema.schedules.kind,
      topicId: schema.schedules.topicId,
      topicLabel: schema.topics.label,
      cronExpr: schema.schedules.cronExpr,
      enabled: schema.schedules.enabled,
      lastRunAt: schema.schedules.lastRunAt,
      createdAt: schema.schedules.createdAt,
    })
    .from(schema.schedules)
    .leftJoin(schema.topics, eq(schema.topics.id, schema.schedules.topicId))
    .orderBy(desc(schema.schedules.createdAt));

  const topics = await db.select().from(schema.topics);

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle="Schedules fire only while this machine is awake. node-cron does not backfill missed runs."
      />
      <div className="p-8 max-w-4xl">
        <SchedulesClient initial={schedules} topics={topics} />
      </div>
    </>
  );
}
