---
name: predeploy
description: Run the full pre-deploy verification gate for Barkin' Beautiful — typecheck, tests, production build, plus the project-specific hazard checks that no test covers (dead-domain fallbacks, stray package-lock.json, npm-polluted node_modules, uncommitted migrations). Use before merging to main, before any release, or when asked to verify the project is sound. Render auto-deploys main, so main IS production.
---

# Pre-deploy verification

Render auto-deploys `main`. **Merging to `main` ships to the live salon.** Run
this gate first, and report honestly — a red gate is a result, not a failure to
work around.

## 0. Confirm the toolchain

This is a **pnpm** project and `npm install` fails outright here (see
`CLAUDE.md` §1). If `node_modules/.pnpm` is missing, the tree was built by npm
and every result below is untrustworthy.

```bash
ls -d node_modules/.pnpm >/dev/null 2>&1 && echo "pnpm tree OK" || echo "NPM-POLLUTED — reinstall"
corepack pnpm install --frozen-lockfile
```

If the lockfile is out of date, `--frozen-lockfile` fails. That is a finding:
`pnpm-lock.yaml` must be committed alongside any `package.json` change.

## 1. The three gates, in order

```bash
corepack pnpm run check     # tsc --noEmit
corepack pnpm test          # vitest run
corepack pnpm run build     # vite build + esbuild server bundle
```

Expected results as of the last full audit:

| Gate      | Expected                                        |
| --------- | ----------------------------------------------- |
| check     | **clean** — zero errors                         |
| test      | **fully green** — 232 passed, 0 failed           |
| build     | **succeeds** — `dist/index.js` + `dist/public/`  |

**There are no known/accepted failures.** The unit suite is hermetic — no
secrets, no network, no database — so **any** failure is a real failure and is
almost certainly caused by the current work. Report the pass/fail counts
explicitly rather than saying "the known ones".

Live-network tests are deliberately excluded from this gate and live in
`server/**/*.integration.test.ts`. They need real credentials and call
third-party APIs, so they are **not** part of pre-deploy verification:

```bash
corepack pnpm run test:integration   # only when you intend to hit live APIs
```

## 2. Hazard checks no test covers

### Dead-domain fallbacks

All client-facing links now route through `getAppBaseUrl()` in
`server/appUrl.ts`, which falls back to `PRODUCTION_APP_URL` and logs loudly
rather than pointing at the decommissioned Manus host.

Confirm nobody has reintroduced a hardcoded fallback:

```bash
grep -rn "groomingsos-mqzfsvzv" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules .
```

**Baseline is exactly 2 hits, both explanatory comments** (`server/appUrl.ts`,
`shared/const.ts`). Any hit in executable code is a regression — flag it.

Also confirm no new call site reads the env var directly instead of the helper:

```bash
grep -rn "process.env.VITE_APP_URL" --include="*.ts" --exclude-dir=node_modules . \
  | grep -vE "server/appUrl\.ts|server/appUrl\.test\.ts"
```

Baseline: **1 hit**, `server/sms.ts` (Twilio status callback, correctly optional).
`appUrl.ts` owns the variable and `appUrl.test.ts` sets it deliberately, so both
are excluded.
Confirm `VITE_APP_URL` is set in the Render environment.

### Stray npm lockfile

```bash
ls package-lock.json 2>/dev/null && echo "DELETE THIS — pnpm project" || echo "clean"
```

### Uncommitted or unreviewed migrations

```bash
git status --porcelain drizzle/
```

A generated migration must be committed with the schema change that produced it.
If `drizzle/` is dirty, stop and run the `db-migration` skill instead — and
remember the migration still has to be applied separately from the deploy.

### Secrets

```bash
git status --porcelain | grep -E "\.env$|\.env\." && echo "STOP: env file staged" || echo "clean"
```

`.env` must never be committed. `.env.example` is the documented contract and is
safe.

## 3. Report

State results plainly:

- Each gate: pass or fail, with the real numbers.
- Test failures: the exact pass/fail counts. The suite is hermetic, so any
  failure is real — never wave one through as "known".
- Each hazard check: result.
- A clear verdict: **safe to merge** or **not safe**, and why.

Do not describe the gate as passing when it did not. Quote the actual output for
anything that failed.
