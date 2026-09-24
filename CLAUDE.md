# Barkin' Beautiful — GSOS (Grooming Salon Operating System)

Production software running a real dog-grooming business. Live staff app:
**https://staff.barkinbeautiful.com.au** — hosted on **Render**, deployed from
`main` on GitHub (`andymclucas/Barkinbeautiful`).

Real clients receive real SMS and email from this system, and real money moves
through Stripe. Treat every change to messaging, billing and scheduling as
production-affecting.

---

## 1. Non-negotiables

**Use pnpm. Never npm.** This is now **enforced** by a `preinstall` guard
(`scripts/enforce-pnpm.mjs`), which fails fast with an explanation if you try
npm or yarn.

```bash
corepack pnpm install --frozen-lockfile
```

This is a pnpm project and `npm install` **fails outright** here: the pinned
`@builder.io/vite-plugin-jsx-loc@0.1.1` declares `peer vite@^4 || ^5` while the
project runs Vite 7, and npm refuses the conflict (`ERESOLVE`). pnpm only warns.

Consequences of using npm anyway:

- `pnpm-lock.yaml` is ignored, so you get wrong versions (e.g. wouter 3.11
  instead of the pinned **3.7.1**).
- `pnpm.patchedDependencies` is ignored, so `patches/wouter@3.7.1.patch` never
  applies. That patch populates `window.__WOUTER_ROUTES__`; it is real, live and
  correctly hashed in the lockfile.
- Native deps such as `sharp` silently fail to install, breaking
  `server/uploadRoutes.ts` (image resizing for pet photos).
- It leaves a stray `package-lock.json` that must never be committed.

`corepack` ships with Node and pins pnpm to the `packageManager` field
(`pnpm@10.4.1`), so `corepack pnpm ...` always uses the right version even
though pnpm is not installed globally on this machine.

**Never commit `package-lock.json`.** If one appears, delete it.

---

## 2. Commands

```bash
corepack pnpm install --frozen-lockfile   # install exactly as production does
corepack pnpm dev                         # dev server, defaults to PORT 3000
corepack pnpm run check                   # tsc --noEmit — currently clean
corepack pnpm test                        # vitest run — hermetic, must be fully green
corepack pnpm run test:integration        # live-network tests, needs real secrets — see §7
corepack pnpm run build                   # vite build + esbuild server bundle
corepack pnpm start                       # run the production bundle from dist/
corepack pnpm run format                  # prettier --write .
corepack pnpm run db:push                 # drizzle-kit generate && migrate — see §6
```

`build` emits the client to `dist/public` and the bundled server to
`dist/index.js`. `start` runs `node dist/index.js`.

---

## 3. Stack

| Layer      | Choice                                                        |
| ---------- | ------------------------------------------------------------- |
| Client     | React 19, Vite 7, TypeScript, Tailwind 4, shadcn/ui + Radix    |
| Routing    | **wouter** (patched, v3.7.1) — not React Router                |
| Data       | tRPC 11 + TanStack Query, `superjson` transformer              |
| Server     | Express 4, bundled with esbuild                                |
| Database   | MySQL / TiDB via **Drizzle ORM** (`mysql2`)                    |
| Auth       | Self-hosted email+password (bcrypt) + signed cookie sessions   |
| Email      | Resend                                                        |
| SMS        | Twilio                                                        |
| Payments   | Stripe                                                        |
| Files      | S3 (`@aws-sdk/client-s3`), images processed with `sharp`       |
| Tests      | Vitest (node environment)                                      |

Path aliases (set in both `vite.config.ts` and `vitest.config.ts`):
`@/*` → `client/src/*`, `@shared/*` → `shared/*`.

---

## 4. Layout

```
client/src/
  pages/            27 route components (Calendar, WorkflowBoard, ClientDetail, …)
  components/       shared UI; components/ui/* is shadcn
  contexts/ hooks/ lib/
  _core/            platform scaffolding — see §8
server/
  routers.ts        ~6,600 lines: ALL tRPC routers (see §5)
  routers/auth.ts   auth router, kept separate
  _core/            platform scaffolding: index.ts (Express boot), trpc.ts, sdk.ts, env.ts
  *.ts              domain logic (workflowTiming, groomInterval, stripePayments, sms, email, …)
  *.test.ts         71 test files — all tests live here (see §7)
shared/             pure logic + types imported by BOTH client and server
drizzle/
  schema.ts         39 tables
  migrations/       generated SQL — never hand-edit applied migrations
docs/               ~50 dated engineering/QA notes (see docs/README.md)
scripts/            one-off operational scripts (Stripe checks, seeding, verification)
```

**`shared/` is the important convention.** Business rules that both sides need
live there as pure functions — `pricingCatalogue`, `membershipPackages`,
`appointmentDuration`, `bathPriorityQueue`, `onlineBookingSlots`,
`familyWorkflowGrouping`, `workflowTimingReviewThresholds`, and more. They are
pure precisely so they can be unit-tested without a database. **Put new business
rules here, not inline in a router or a component.**

---

## 5. The `routers.ts` monolith

`server/routers.ts` is ~6,600 lines holding 26 router namespaces, composed at the
bottom (~line 6550):

`system, auth, calendar, workflow, tracker, clients, pets, staff, memberships,
groomNotes, groomingReports, groomStylePresets, pricing, storeCredit, retail,
analytics, analyticsExt, migration, settings, stripeBilling, onlineBooking,
campaigns, family, sms, clientPortal, workflowReview`

Do not read the whole file. Find the namespace at the composition block, then
jump to its definition. Prefer extracting genuinely new surface into
`server/routers/<name>.ts` (as `auth.ts` already is) over growing this file.

### Procedure types — the naming is counter-intuitive, read carefully

Defined in `server/_core/trpc.ts`:

| Procedure              | Who may call it                                                |
| ---------------------- | -------------------------------------------------------------- |
| `publicProcedure`      | anyone, unauthenticated                                        |
| `protectedProcedure`   | authenticated **but NOT `staff`** — owner/admin surface         |
| `operationalProcedure` | **any** authenticated user, including restricted `staff`        |
| `adminProcedure`       | `role === "admin"` only                                        |

`protectedProcedure` deliberately **rejects** `staff` accounts with `FORBIDDEN`.
Restricted staff are confined to their own appointments and workflow, and must
opt in explicitly via `operationalProcedure`.

**Picking the wrong one is a security bug in both directions** — using
`operationalProcedure` for owner-only data exposes the business to every groomer;
using `protectedProcedure` for a workflow action breaks the salon floor.

Two distinct role systems exist and must not be conflated:

- `users.role`: `user | admin | staff` — platform/auth level.
- `staff.role`: `owner | groomer | bather | receptionist | manager` — salon level.

---

## 6. Database

39 tables in `drizzle/schema.ts`. Central chain:
`tenants → clients → pets → appointments → workflowLogs`, with `memberships`,
`invoices`, `membershipLedgerEntries`, `familyGroups`, `smsLogs`, `petPhotos`
hanging off it. Multi-tenant: most tables carry `tenantId`, and **queries must
filter on it**.

The appointment workflow is a 12-state machine (`appointments.workflowState`):

```
scheduled → checked_in → waiting_for_bath → bathing → waiting_for_dry → drying
          → waiting_for_groom → grooming → ready → complete
          (+ cancelled, no_show)
```

`workflowLogs` records every `fromState`/`toState` transition — it powers the Pet
Tracker and the workflow timing analytics. Preserve that audit trail.

Migrations:

```bash
corepack pnpm run db:push   # drizzle-kit generate && drizzle-kit migrate
```

Rules: never hand-edit a migration that has already run; never `drizzle-kit
push` against production; a schema change and the code that depends on it must
ship together. Commit `b848737` ("HOTFIX: remove reference to not-yet-migrated
`moego_pet_codes` column") is what happens when they don't.

---

## 7. Testing

```bash
corepack pnpm test
```

71 files, 232 tests. **The suite is fully green and must stay that way.** It is
hermetic: no secrets, no network, no database. A failure is a real failure.

### Live-network tests are separated

Tests needing real credentials or outbound calls live in
`server/**/*.integration.test.ts`, are excluded from the default run by
`vitest.config.ts`, and have their own config:

```bash
corepack pnpm run test:integration   # needs RESEND_API_KEY; makes real API calls
```

`server/resendCredential.integration.test.ts` is the only one so far. **Do not
wire this into CI** without deciding deliberately that CI should hold live
credentials and call third-party APIs.

### Why tests are shaped oddly

`vitest.config.ts` includes **only** `server/**/*.test.ts`. There is no jsdom
environment and no client test setup. So client behaviour is currently "tested"
by reading `.tsx` **source text** and asserting on substrings:

```ts
const workflowSource = readFileSync(/* WorkflowBoard.tsx */, "utf8");
expect(completionHandler).toContain("onSuccess: () => {");
```

These break on any refactor while the app still works — which is exactly what
happened when the pickup-SMS prompt moved from `complete` to `ready` (`16bf5e3`)
and `server/pickupMessageCompletion.test.ts` went stale. Such tests assert
formatting, not behaviour.

**Guidance:** do not add more source-grep tests. Put the logic in `shared/` as a
pure function and test that. The durable fix is to add a jsdom environment plus
Testing Library and test components properly; until then, prefer extraction.

---

## 8. `_core/` and the Manus residue

This app was originally built on the **Manus** platform and has since been
rebuilt to run freestanding on Render. Residue remains, and you need to know
what is live and what is dead.

`_core/` directories (`server/_core`, `client/src/_core`, `shared/_core`) are the
original platform scaffolding. They are now **ours** and edited normally, but
they hold the load-bearing plumbing — Express boot, tRPC setup, cookies,
sessions, env. Change them deliberately.

Still live, still Manus-branded:

- `vite-plugin-manus-runtime` (0.0.59) and `@builder.io/vite-plugin-jsx-loc` are
  real build-time dependencies in `vite.config.ts`. The jsx-loc one is the cause
  of the npm conflict in §1. Both are AI-builder tooling and are candidates for
  removal — but removal must be verified against a Render deploy, not assumed.
- `vite.config.ts` writes browser logs to `.manus-logs/` in dev and whitelists
  `*.manus.computer` dev hosts. Harmless, unused in production.
- `server/_core/sdk.ts` still speaks the Manus OAuth session contract. Auth is
  self-hosted (bcrypt + `sdk.createSessionToken`), and when `VITE_APP_ID` /
  `OAUTH_SERVER_URL` are absent it falls back to
  `SELF_HOSTED_PASSWORD_APP_ID = "groomigo-self-hosted-password"`. The session
  token format was kept deliberately so sessions survived the migration.

### Client-facing link URLs — use `getAppBaseUrl()`

**Always build client-facing links from `server/appUrl.ts`:**

```ts
import { getAppBaseUrl } from "./appUrl";
const trackerUrl = `${getAppBaseUrl()}/track/${token}`;
```

It reads `VITE_APP_URL`, normalises trailing slashes, validates the URL, and
falls back to `PRODUCTION_APP_URL` (`shared/const.ts`) while logging an error.
The resolved value is also logged at boot, so a misconfigured deploy is visible
in the Render log.

**Why it exists.** Eight call sites used to inline this:

```ts
process.env.VITE_APP_URL ?? "https://groomingsos-mqzfsvzv.manus.space"
```

That host is the **decommissioned** Manus deployment. With `VITE_APP_URL` unset,
password-reset links, Pet Tracker SMS, staff invitations and campaign unsubscribe
links all pointed at a dead domain, and nothing was logged — invisible until a
customer complained. Commit `a238972` fixed one round of exactly this. All eight
now route through the helper.

It deliberately **warns rather than throws**: turning a misconfiguration into a
boot failure would take the live salon offline, which is worse than a slightly
wrong base URL on a preview environment.

**`VITE_APP_URL` must still be set to `https://staff.barkinbeautiful.com.au` in
the Render environment.** Never reintroduce a hardcoded host fallback.

---

## 9. Environment

No `.env` is committed (correctly). See **`.env.example`** for the full contract.

Required for the app to work: `DATABASE_URL`, `JWT_SECRET`, `VITE_APP_URL`,
`OWNER_EMAIL`.
Integrations: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`.
Legacy/Manus, safe to leave unset: `VITE_APP_ID`, `OAUTH_SERVER_URL`,
`OWNER_OPEN_ID`, `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`.

`SMS_AUTOMATION_ENABLED` gates automated outbound SMS. **Keep it off outside
production** unless you intend to text real clients.

Scheduled jobs are plain HTTP endpoints guarded by `CRON_SECRET`, driven by an
external scheduler:

- `POST /api/scheduled/payment-retry`
- `POST /api/scheduled/appointment-reminders`

---

## 10. Conventions

- TypeScript throughout, strict. `corepack pnpm run check` must stay clean.
- Prettier is the formatter; do not hand-format. Config in `.prettierrc`.
- Business rules → `shared/` as pure functions, with a colocated unit test.
- Server domain logic → `server/<feature>.ts` + `server/<feature>.test.ts`.
- Dates: use `date-fns`. Timezone is **Australia/Brisbane** and there is real
  history of timezone bugs (`e6a4662`, `server/localDateTime.ts`). Do not rely on
  the system timezone — commit `e6a4662` fixed exactly that.
- Money: dollars are stored as decimals, Stripe wants integer cents. Convert at
  the boundary (`Math.round(Number(total) * 100)`).
- Multi-tenant: filter by `tenantId`.
- Commits: short imperative subject describing user-visible effect. History uses
  both plain (`Fix calendar day view showing wrong appointment count`) and
  Conventional (`feat:`, `fix:`) styles; match whichever the surrounding commits
  use.

---

## 11. Before you ship

Run all three, in order:

```bash
corepack pnpm run check && corepack pnpm test && corepack pnpm run build
```

The suite must be **fully green** — it is hermetic, so any failure is real.

Render deploys `main` automatically, so **`main` is production**. Work on a
branch for anything non-trivial.

---

## 12. Working here with Claude Code

Custom agents in `.claude/agents/` and skills in `.claude/skills/`:

| Use                                                     | Invoke                     |
| ------------------------------------------------------- | -------------------------- |
| Full pre-deploy gate (types, tests, build, env, hazards) | `/predeploy`               |
| Safe Drizzle schema change + migration                   | `/db-migration`            |
| Guardrails before touching client SMS/email/billing      | `/client-messaging-safety` |
| Add a tRPC endpoint following project conventions        | `/new-endpoint`            |
| Find things inside the `routers.ts` monolith             | `router-navigator` agent   |
| Review business logic against grooming domain rules      | `domain-reviewer` agent    |
| Review a schema/migration change for safety              | `schema-guardian` agent    |

### Repository copies — use this one only

The authoritative checkout is **`~/Documents/GitHub/Barkinbeautiful`** (this one).
Two stale copies exist and must not be edited:
`~/.gemini/antigravity/scratch/Barkinbeautiful` (Antigravity workspace, behind
`main`) and `~/Downloads/gsos` (no git at all). Neither holds unique work.
