import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

/**
 * Integration test config — run deliberately, never in the default suite:
 *
 *   corepack pnpm run test:integration
 *
 * These tests require real production secrets (RESEND_API_KEY, Stripe keys) and
 * make real outbound network calls. Keeping them in a separate config means
 * `pnpm test` stays hermetic and passes with no credentials on any machine.
 *
 * Do NOT wire this into CI without deciding, deliberately, that CI should hold
 * live credentials and be allowed to call third-party APIs.
 */
export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.integration.test.ts"],
  },
});
