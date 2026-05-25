import { desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { TopicsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  const topics = await db.select().from(schema.topics).orderBy(desc(schema.topics.createdAt));
  return (
    <>
      <PageHeader
        title="Deep research topics"
        subtitle="Define topics you want the Deep Research + Social + Briefing agents to run against on demand or on a schedule."
      />
      <div className="p-8 max-w-4xl">
        <TopicsClient initial={topics} />
      </div>
    </>
  );
}
