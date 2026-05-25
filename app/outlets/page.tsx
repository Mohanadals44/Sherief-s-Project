import { db, schema } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { OutletsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function OutletsPage() {
  const outlets = await db.select().from(schema.outlets).orderBy(schema.outlets.name);
  return (
    <>
      <PageHeader
        title="News outlets"
        subtitle="Configure which RSS feeds the Daily Briefing agent pulls from. Toggle outlets on/off, add custom feeds."
      />
      <div className="p-8 max-w-5xl">
        <OutletsClient initial={outlets} />
      </div>
    </>
  );
}
