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
    /**
     * Headroom for component tests under worker contention.
     *
     * vitest's default is 5s, which is generous for a pure function and
     * tight for a component test that types through `user.type` - every
     * character dispatches a full event sequence and re-renders inside
     * `act()`. Measured 03/11/2026: NewClientQuickAdd.test.tsx runs its 14
     * tests in 3.1s on an idle machine and 16-19s when the other three
     * dozen jsdom files are competing for workers, with nothing changed
     * between the two.
     *
     * That spread means individual tests cross 5s on load alone, and the
     * suite fails at random - which is far worse than a slow one, because
     * CLAUDE.md §7 promises the next person that any failure is real. It
     * had already been patched per-file once; a second unexplained failure
     * after two more jsdom files were added is the point to stop playing
     * whack-a-mole and move the budget.
     *
     * This is NOT cover for a hang. 20s is still two orders of magnitude
     * past anything here that works: the slowest single test on an idle
     * machine is under half a second. A test that reaches 20s is stuck,
     * and will still say so.
     */
    testTimeout: 20_000,
    setupFiles: ["./client/src/test/setup.ts"],
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      /**
       * shared/ is here because CLAUDE.md §10 tells you to colocate a
       * unit test with the pure function it covers, and without this
       * glob such a test is collected by nothing and "passes" by never
       * running. Found 09/11/2026: shared/calendarDeepLink.test.ts sat
       * in shared/ and the suite reported 364 files green without it.
       *
       * The repo's own 300-odd tests for shared modules all live in
       * server/, which is why nobody had hit this. That convention
       * stands; this is so following the documented one does not give
       * a silent pass.
       */
      "shared/**/*.test.ts",
      "client/**/*.test.ts",
      "client/**/*.test.tsx",
    ],
    // Integration tests need real production secrets and make real outbound
    // network calls, so they are kept out of the default `pnpm test` run to keep
    // it hermetic. Run them deliberately with `pnpm run test:integration`.
    exclude: ["**/node_modules/**", "**/dist/**", "server/**/*.integration.test.ts"],
  },
});
