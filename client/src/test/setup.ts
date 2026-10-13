/**
 * Test setup, shared by both environments.
 *
 * vitest runs one setup list for every test file, and this project has two
 * kinds: the hermetic server/shared tests in a node environment, and
 * component tests in jsdom.
 *
 * Everything here is behind a `document` check and loaded dynamically. That
 * is not fussiness: importing Testing Library statically pulls React DOM
 * into all 169 node test files and put 16 seconds on the suite, for
 * machinery none of them use. The guard checks the environment itself
 * rather than inspecting config, and the node tests are left exactly as
 * they were.
 */
import { afterEach, beforeAll } from "vitest";

if (typeof document !== "undefined") {
  // toBeInTheDocument, toHaveTextContent and the rest. Registered before
  // any test in the file runs, which is all the matchers need.
  beforeAll(async () => {
    await import("@testing-library/jest-dom/vitest");
  });

  // Unmount between tests. Without it the previous test's DOM is still
  // there and a getByText can match a component the current test never
  // rendered — which passes, and means nothing.
  afterEach(async () => {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  });
}
