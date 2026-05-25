import Parser from "rss-parser";
import { db, schema } from "../lib/db";

const parser = new Parser({
  timeout: 15_000,
  headers: {
    "User-Agent": "Mozilla/5.0 NewsOrchestration RSS audit",
    Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
  },
});

async function main() {
  const outlets = await db.select().from(schema.outlets).orderBy(schema.outlets.name);
  let failures = 0;

  for (const outlet of outlets) {
    const started = Date.now();
    try {
      const feed = await parser.parseURL(outlet.rssUrl);
      const count = feed.items?.length ?? 0;
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `${String(outlet.id).padStart(2)} OK   ${String(count).padStart(3)} items ${elapsed}s ${outlet.name} -> ${outlet.rssUrl}`,
      );
    } catch (err) {
      failures += 1;
      console.log(`${String(outlet.id).padStart(2)} FAIL ${outlet.name} -> ${outlet.rssUrl} :: ${(err as Error).message}`);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} feed(s) failed.`);
    process.exit(1);
  }

  console.log(`\nAll ${outlets.length} feeds responded.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
