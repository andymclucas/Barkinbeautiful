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
  // Discrete credentials, NOT `url`.
  //
  // TiDB Cloud's public endpoint refuses plaintext ("Connections using
  // insecure transport are prohibited"). drizzle-kit 0.31.5 silently drops
  // the ssl block when `url` is also set, so every migrate attempt failed on
  // the handshake even though the ssl option was right there. Parsing the URL
  // ourselves and passing the parts keeps ssl in play. server/db.ts carries
  // the same explicit ssl block for the same reason.
  dbCredentials: (() => {
    const parsed = new URL(connectionString);
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 4000,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, ""),
      ssl: { minVersion: "TLSv1.2" as const, rejectUnauthorized: true },
    };
  })(),
});
