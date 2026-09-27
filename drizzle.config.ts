import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// The app loads .env via `import "dotenv/config"` in server/_core/index.ts, but
// drizzle-kit runs this config in its own process and did not — so every
// migration command needed DATABASE_URL passed inline, even with a .env sitting
// right there. Loading it here makes one .env file enough for the whole repo.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
});
