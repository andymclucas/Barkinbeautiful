import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

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
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    // Integration tests need real production secrets and make real outbound
    // network calls, so they are kept out of the default `pnpm test` run to keep
    // it hermetic. Run them deliberately with `pnpm run test:integration`.
    exclude: ["**/node_modules/**", "**/dist/**", "server/**/*.integration.test.ts"],
  },
});
