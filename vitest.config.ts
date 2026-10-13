import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  // Only the React plugin, not vite.config.ts's full list. The Manus
  // runtime and jsx-loc plugins are build-time AI-builder tooling with no
  // bearing on a test, and pulling them in here would make the suite
  // depend on them.
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    // node by default; the client files below get jsdom. Component tests
    // live beside what they test, which is where someone changing a
    // component will actually look.
    environment: "node",
    environmentMatchGlobs: [["client/**", "jsdom"]],
    setupFiles: ["./client/src/test/setup.ts"],
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "client/**/*.test.ts",
      "client/**/*.test.tsx",
    ],
    // Integration tests need real production secrets and make real outbound
    // network calls, so they are kept out of the default `pnpm test` run to keep
    // it hermetic. Run them deliberately with `pnpm run test:integration`.
    exclude: ["**/node_modules/**", "**/dist/**", "server/**/*.integration.test.ts"],
  },
});
