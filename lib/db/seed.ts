import { eq } from "drizzle-orm";
import { db, schema } from "./index";
import { DEFAULT_SETTINGS } from "../config";

const DEFAULT_OUTLETS: Array<{ name: string; rssUrl: string; category: string }> = [
  // Reuters and AP no longer provide stable official public RSS endpoints. Google News RSS queries
  // give us reliable headlines from those domains without scraping or API keys.
  { name: "Reuters - World", rssUrl: "https://news.google.com/rss/search?q=site:reuters.com&hl=en-US&gl=US&ceid=US:en", category: "global" },
  { name: "Associated Press - Top News", rssUrl: "https://news.google.com/rss/search?q=site:apnews.com&hl=en-US&gl=US&ceid=US:en", category: "global" },
  { name: "BBC News - World", rssUrl: "http://feeds.bbci.co.uk/news/world/rss.xml", category: "global" },
  { name: "BBC News - Business", rssUrl: "http://feeds.bbci.co.uk/news/business/rss.xml", category: "business" },
  { name: "The Guardian - World", rssUrl: "https://www.theguardian.com/world/rss", category: "global" },
  { name: "Al Jazeera English", rssUrl: "https://www.aljazeera.com/xml/rss/all.xml", category: "global" },
  { name: "Nikkei Asia", rssUrl: "https://asia.nikkei.com/rss/feed/nar", category: "asia" },
  { name: "The Economist - Latest", rssUrl: "https://www.economist.com/latest/rss.xml", category: "analysis" },
  { name: "Financial Times - Home", rssUrl: "https://www.ft.com/?format=rss", category: "business" },
  { name: "Bloomberg - Markets", rssUrl: "https://feeds.bloomberg.com/markets/news.rss", category: "business" },
  { name: "Bloomberg - Politics", rssUrl: "https://feeds.bloomberg.com/politics/news.rss", category: "politics" },
  { name: "Wall Street Journal - World", rssUrl: "https://feeds.a.dj.com/rss/RSSWorldNews.xml", category: "global" },
  { name: "Wall Street Journal - Markets", rssUrl: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", category: "business" },
  { name: "New York Times - World", rssUrl: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", category: "global" },
  { name: "New York Times - Politics", rssUrl: "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml", category: "politics" },
  { name: "New York Times - Business", rssUrl: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", category: "business" },
  { name: "Washington Post - Politics", rssUrl: "https://feeds.washingtonpost.com/rss/politics", category: "politics" },
  { name: "Washington Post - World", rssUrl: "https://feeds.washingtonpost.com/rss/world", category: "global" },
  { name: "Politico - Top", rssUrl: "https://rss.politico.com/politics-news.xml", category: "politics" },
  { name: "Axios - Top", rssUrl: "https://api.axios.com/feed/", category: "politics" },
  { name: "The Atlantic - Politics", rssUrl: "https://www.theatlantic.com/feed/channel/politics/", category: "analysis" },
  { name: "CNBC - Top News", rssUrl: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", category: "business" },
  { name: "Deutsche Welle - World", rssUrl: "https://rss.dw.com/rdf/rss-en-all", category: "global" },
  { name: "France 24 - World", rssUrl: "https://www.france24.com/en/rss", category: "global" },
  { name: "CBS News - World", rssUrl: "https://www.cbsnews.com/latest/rss/world", category: "global" },
  { name: "ABC News - International", rssUrl: "https://abcnews.go.com/abcnews/internationalheadlines", category: "global" },
  { name: "NPR News - World", rssUrl: "https://feeds.npr.org/1004/rss.xml", category: "global" },
  { name: "NPR News - Politics", rssUrl: "https://feeds.npr.org/1014/rss.xml", category: "politics" },
  { name: "اللواء اللبنانية", rssUrl: "https://news.google.com/rss/search?q=site:aliwaa.com.lb&hl=ar&gl=LB&ceid=LB:ar", category: "arabic" },
  { name: "النهار اللبنانية", rssUrl: "https://news.google.com/rss/search?q=site:annahar.com&hl=ar&gl=LB&ceid=LB:ar", category: "arabic" },
  { name: "الأخبار اللبنانية", rssUrl: "https://news.google.com/rss/search?q=site:al-akhbar.com%20OR%20site:akhbar.com&hl=ar&gl=LB&ceid=LB:ar", category: "arabic" },
  { name: "نداء الوطن اللبنانية", rssUrl: "https://news.google.com/rss/search?q=site:nidaalwatan.com%20OR%20site:nedaelwatan.com&hl=ar&gl=LB&ceid=LB:ar", category: "arabic" },
  { name: "القدس العربي", rssUrl: "https://news.google.com/rss/search?q=site:alquds.co.uk&hl=ar&gl=GB&ceid=GB:ar", category: "arabic" },
  { name: "العربي الجديد", rssUrl: "https://news.google.com/rss/search?q=site:alaraby.co.uk&hl=ar&gl=GB&ceid=GB:ar", category: "arabic" },
  { name: "الشرق الأوسط", rssUrl: "https://news.google.com/rss/search?q=site:aawsat.com&hl=ar&gl=SA&ceid=SA:ar", category: "arabic" },
  { name: "العرب", rssUrl: "https://news.google.com/rss/search?q=site:alarab.co.uk&hl=ar&gl=GB&ceid=GB:ar", category: "arabic" },
];

async function seed() {
  console.log("Seeding database...");

  const existingOutlets = await db.select().from(schema.outlets);
  const existingByName = new Map(existingOutlets.map((outlet) => [outlet.name, outlet]));
  let inserted = 0;
  let updated = 0;
  for (const outlet of DEFAULT_OUTLETS) {
    const existing = existingByName.get(outlet.name);
    if (existing) {
      if (existing.rssUrl !== outlet.rssUrl || existing.category !== outlet.category) {
        await db
          .update(schema.outlets)
          .set({ rssUrl: outlet.rssUrl, category: outlet.category })
          .where(eq(schema.outlets.id, existing.id));
        updated += 1;
      }
    } else {
      await db.insert(schema.outlets).values({ ...outlet, enabled: true });
      inserted += 1;
    }
  }
  console.log(`Outlets synced: ${inserted} inserted, ${updated} updated, ${DEFAULT_OUTLETS.length} configured`);

  const existingSettings = await db.select().from(schema.settings);
  const settingsByKey = new Map(existingSettings.map((s) => [s.key, s.value]));
  const toInsert = DEFAULT_SETTINGS.filter((s) => !settingsByKey.has(s.key));
  if (toInsert.length > 0) {
    await db.insert(schema.settings).values(toInsert);
    console.log(`Inserted ${toInsert.length} settings`);
  } else {
    console.log("Settings already seeded");
  }

  const existingSchedules = await db.select().from(schema.schedules);
  if (existingSchedules.length === 0) {
    await db.insert(schema.schedules).values({
      kind: "daily_briefing",
      cronExpr: "0 7 * * *",
      enabled: false,
    });
    console.log("Inserted default daily 7am briefing schedule (disabled)");
  }

  console.log("Done.");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
