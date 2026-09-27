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
    // TiDB Cloud's public endpoint requires TLS, and mysql2's URI parsing does
    // not reliably turn SSL on from the connection string alone — server/db.ts
    // has carried an explicit ssl block for exactly this reason since it was
    // written. drizzle-kit builds its own connection from this config, so it
    // needs the same treatment or every migration fails on the handshake.
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  },
});
