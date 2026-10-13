import { vi } from "vitest";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

/**
 * A stand-in for the tRPC client, for component tests.
 *
 * Components reach the server through `trpc.<router>.<procedure>.useQuery`.
 * A test cannot run the real one — there is no server and no database — so
 * the transport is replaced. The TYPES are not: `RouterOutputs` below is
 * inferred from the real AppRouter, so a fixture that stops matching what
 * the procedure actually returns fails `tsc`, not silently at runtime.
 *
 * That distinction is the whole point. Mocking the shape as well as the
 * transport would rebuild exactly the problem the source-grep tests had —
 * a test that passes because it agrees with itself rather than with the
 * code. Fixtures here are typed; if a procedure's return type changes, the
 * fixture is a compile error.
 *
 * Usage, at the top of a test file:
 *
 *   vi.mock("@/lib/trpc", () => ({ trpc: trpcStub({ ... }) }));
 *
 * `vi.mock` is hoisted above imports, so the stub must be built inside the
 * factory rather than referenced from a variable.
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

/** What a settled `useQuery` looks like to a component. */
export function queryResult<T>(data: T) {
  return {
    data,
    isLoading: false,
    isFetching: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
  };
}

/** A query that has not come back yet. */
export function loadingQuery() {
  return {
    data: undefined,
    isLoading: true,
    isFetching: true,
    isError: false,
    isSuccess: false,
    error: null,
    refetch: vi.fn(),
  };
}

/** A mutation nobody has called. `mutate` is a spy, so a test can assert on it. */
export function mutationResult() {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    reset: vi.fn(),
  };
}

type Stubs = Record<string, unknown>;

/**
 * Build the nested `trpc` object a component expects.
 *
 * Keys are dotted paths — "bookingPricing.catalogue" — mapping to whatever
 * that procedure's hook should return. Anything not named gets an empty
 * settled query, so a component reaching for a procedure the test did not
 * think about renders rather than throwing; the test then fails on what is
 * missing from the screen, which is the more useful failure.
 *
 * `useUtils()` returns a proxy where every path has an `invalidate` spy,
 * since invalidation is a cache concern with nothing to assert.
 */
export function trpcStub(stubs: Stubs) {
  const node = (path: string): any =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "useQuery") {
            return () => stubs[path] ?? queryResult(undefined);
          }
          if (prop === "useMutation") {
            return () => stubs[path] ?? mutationResult();
          }
          if (prop === "useUtils" || prop === "invalidate") {
            return () => undefined;
          }
          return node(path === "" ? prop : `${path}.${prop}`);
        },
      },
    );

  const utils = (): any =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "invalidate") return vi.fn();
          return utils();
        },
      },
    );

  return new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === "useUtils") return utils;
        return node(prop);
      },
    },
  );
}
