/**
 * Every tRPC procedure in the app, and which builder guards it.
 *
 * The four builders are a security decision and CLAUDE.md §5 is blunt about
 * it: picking the wrong one is a bug in both directions. `publicProcedure`
 * is reachable by anyone on the internet; `operationalProcedure` is
 * reachable by a restricted groomer account; `protectedProcedure` rejects
 * those; `adminProcedure` is owner-only.
 *
 * Until now that was guarded by scattered assertions of the form
 * `expect(routerSource).toContain("updateStage: operationalProcedure")`.
 * Three problems with that:
 *
 *   - It is one-way. It proves a procedure IS operational; it says nothing
 *     about the eighty-eight others, so a new unauthenticated endpoint
 *     could appear and no test would notice.
 *   - The anchors are ambiguous. `requireApprovedStaffTenant` matched 24
 *     places; `create:` matches a dozen routers.
 *   - It never fails when something is REMOVED from a guard, only when the
 *     literal text changes shape.
 *
 * So this parses the whole surface instead and the test pins it. Adding an
 * endpoint is then a deliberate act with a visible diff, which is what you
 * want from the line between "anyone" and "signed-in owner".
 *
 * It reads source text, which is not ideal — but it is reading it as a
 * STRUCTURE rather than fishing for substrings, and the alternative
 * (instrumenting the tRPC builders at runtime) would put test scaffolding
 * into the request path of a live salon.
 */
export type ProcedureKind = "public" | "operational" | "protected" | "admin";

export type ProcedureEntry = {
  /** e.g. "clientsRouter.create" — the router const, not the appRouter key. */
  id: string;
  router: string;
  name: string;
  kind: ProcedureKind;
};

const ROUTER_DECL = /^(?:export\s+)?const\s+([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*router\(\{/;
const PROCEDURE_DECL =
  /^\s{2}([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*(public|operational|protected|admin)Procedure\b/;

/**
 * Attribute each procedure to the router const above it.
 *
 * Procedures are declared at exactly two spaces of indentation inside a
 * `const xRouter = router({` block, and no router is nested inside another
 * — both checked against the real files. A procedure found before any
 * router declaration is attributed to "(none)", which the test treats as a
 * parse failure rather than quietly dropping it.
 */
export function parseProcedureSurface(sources: ReadonlyArray<string>): ProcedureEntry[] {
  const entries: ProcedureEntry[] = [];
  for (const source of sources) {
    let currentRouter = "(none)";
    for (const line of source.split("\n")) {
      const router = ROUTER_DECL.exec(line);
      if (router) {
        currentRouter = router[1];
        continue;
      }
      const procedure = PROCEDURE_DECL.exec(line);
      if (procedure) {
        entries.push({
          id: `${currentRouter}.${procedure[1]}`,
          router: currentRouter,
          name: procedure[1],
          kind: procedure[2] as ProcedureKind,
        });
      }
    }
  }
  // Plain comparison, not localeCompare: sort order must not depend on the
  // machine's locale, or the pinned lists below would differ between a
  // laptop and CI.
  return entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Just the ids guarded by one builder, sorted. */
export function idsOfKind(entries: ReadonlyArray<ProcedureEntry>, kind: ProcedureKind): string[] {
  return entries.filter((entry) => entry.kind === kind).map((entry) => entry.id).sort();
}
