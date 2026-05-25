import type { Config } from "drizzle-kit";

const dbPath = process.env.DATABASE_URL ?? "./data/app.db";

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
  verbose: true,
  strict: true,
} satisfies Config;
