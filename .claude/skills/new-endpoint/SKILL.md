---
name: new-endpoint
description: Add a tRPC procedure or router namespace to Barkin' Beautiful following the project's real conventions — choosing the correct access level (the names are counter-intuitive and getting it wrong is a security bug), putting business rules in shared/ as testable pure functions, enforcing tenant isolation, and avoiding growth of the 6,600-line routers.ts monolith. Use when adding or changing a server endpoint.
---

# Adding a tRPC endpoint

## 1. Choose the access level — read this table carefully

Defined in `server/_core/trpc.ts`. **The names mislead.**

| Procedure              | Who may call it                               |
| ---------------------- | --------------------------------------------- |
| `publicProcedure`      | anyone, unauthenticated                       |
| `protectedProcedure`   | authenticated but **NOT `staff`**             |
| `operationalProcedure` | any authenticated user, **including `staff`** |
| `adminProcedure`       | `role === "admin"` only                       |

`protectedProcedure` actively **rejects** `staff` accounts with `FORBIDDEN`.
Restricted staff are deliberately confined to their own appointments and
workflow, and must opt in per-endpoint via `operationalProcedure`.

Getting this wrong is a security bug **in both directions**:

- `operationalProcedure` on owner-only data — revenue, payroll, analytics, client
  financials, settings — exposes the business to every groomer and bather.
- `protectedProcedure` on a salon-floor action — advancing workflow, checking a
  dog in — locks staff out of doing their job.

Decide from the question: *should a bather see this?* If no, it is not
`operationalProcedure`.

Don't confuse the two role systems: `users.role` is `user | admin | staff`
(platform), while `staff.role` is `owner | groomer | bather | receptionist |
manager` (salon).

## 2. Put the business rule in `shared/`, not the router

This is the convention that makes the codebase testable. Pure rules live in
`shared/` — `pricingCatalogue`, `membershipPackages`, `appointmentDuration`,
`onlineBookingSlots`, `bathPriorityQueue`, `familyWorkflowGrouping`,
`workflowTimingReviewThresholds` and others. They are pure so they can be unit
tested with no database, and so the client can apply the same rule without a round
trip.

The router should do: validate input → query → **call the pure function** →
persist → return.

Do not inline pricing, eligibility, duration or allowance logic into a procedure.
If your endpoint contains a business decision, extract it:

```
shared/<feature>.ts          # pure function, no db, no io
server/<feature>.test.ts     # unit test for it — tests live under server/
```

## 3. Write the procedure

Input validation uses **zod 4**. The transformer is `superjson`, so `Date` and
`Map` cross the wire intact — no manual serialisation.

**Filter by `tenantId`.** This app is multi-tenant; nearly every table carries it.
A missing filter is a data-leak bug that will never fail a type check and looks
fine with one tenant in the database.

Where to put it:

- Extending an existing namespace → find it in `server/routers.ts`. The 26
  namespaces are composed near line 6550; locate the variable there, then jump to
  its definition. **Do not read the whole file** — use the `router-navigator`
  agent.
- A genuinely new feature area → create `server/routers/<name>.ts` and register it
  in the composition block, as `auth.ts` already does. `routers.ts` is ~6,600
  lines; prefer not to grow it.

If the endpoint changes appointment state, write to `workflowLogs`
(`fromState`/`toState`). That audit trail powers the Pet Tracker and all workflow
timing analytics — skipping it corrupts both silently.

If it builds a client-facing URL, use `getAppBaseUrl()` from `server/appUrl.ts` —
never `process.env.VITE_APP_URL` directly, and never a hardcoded host. Read the
`client-messaging-safety` skill first.

## 4. Test it

Tests live in `server/*.test.ts` and run under **vitest with the node
environment**. `vitest.config.ts` includes only `server/**/*.test.ts`.

Test the pure function in `shared/` directly — that is the point of extracting it.
For the procedure itself, `appRouter.createCaller(ctx)` with a hand-built context
is the established pattern; see `server/auth.logout.test.ts`.

**Do not write source-grep tests.** Several existing tests read `.tsx` source text
and assert on substrings, e.g.:

```ts
expect(completionHandler).toContain("onSuccess: () => {");
```

These assert formatting rather than behaviour and break on any refactor while the
app still works — `server/pickupMessageCompletion.test.ts` broke exactly this way
when the pickup prompt moved from `complete` to `ready`. Extract the logic into
`shared/` and test it properly instead.

## 5. Use it from the client

The client calls tRPC through TanStack Query (`client/src/lib/trpc.ts`):

```ts
const { data } = trpc.<namespace>.<procedure>.useQuery({ tenantId });
const mutation = trpc.<namespace>.<procedure>.useMutation({
  onSuccess: () => refetch(),
});
```

Types flow automatically from `AppRouter` — never redeclare a response shape by
hand.

## 6. Verify

```bash
corepack pnpm run check && corepack pnpm test
```

The suite must be fully green — it is hermetic, so any failure is real. Then
run the `domain-reviewer` agent if the endpoint touches appointments, memberships,
pricing, invoices or staff permissions.
