---
name: unattended-deploy
description: Ship to production without waiting for Andy — merge to main, apply migrations, deploy and verify, while he is asleep or away. Use whenever work is finished and he is not available to approve it, or he has said to carry on unattended. Covers the verification that must pass before anything reaches the live salon, how to prove the platform still works afterwards, how to roll back alone, and the short list of things that still need a human no matter what.
---

# Shipping while Andy is asleep

Andy often starts work here and goes to bed. Waiting for approval wastes
the night; shipping carelessly to a live salon is worse. This is how to
do it unattended and still be able to look him in the eye in the morning.

**A skill does not grant permission.** The gates are the harness
classifier and `.claude/settings.json`. If a tool call is denied, that is
an answer — use `branch-when-blocked` and leave it for him. Never work
around a denial.

## The gate, every time, before anything merges

```bash
corepack pnpm run check && corepack pnpm test && corepack pnpm run build
```

All three, in that order, fully green. The suite is hermetic — no
secrets, no network, no database — so any failure is real and is almost
certainly yours. **A red gate means it does not ship.** Fix it or branch
it; do not merge past it and do not describe it as passing.

## Migrations change the order

Drizzle names every declared column in every bare select, so code that
reaches `main` before its migration breaks every query on that table.

```bash
# 1. ledger must read 0 outstanding BEFORE, and after applying
node -e 'require("dotenv").config({quiet:true});const m=require("mysql2/promise"),f=require("fs");
(async()=>{const c=await m.createConnection({uri:process.env.DATABASE_URL,ssl:{minVersion:"TLSv1.2",rejectUnauthorized:true}});
const [[r]]=await c.query("SELECT MAX(created_at) n FROM __drizzle_migrations");
const j=JSON.parse(f.readFileSync("drizzle/meta/_journal.json","utf8"));
console.log(j.entries.filter(e=>e.when>Number(r.n)).length,"outstanding");await c.end();})()'

# 2. apply, from the branch that carries them
corepack pnpm exec drizzle-kit migrate

# 3. confirm the columns or tables exist with SHOW COLUMNS / SHOW TABLES
# 4. only then merge
```

If the outstanding count is anything other than the migrations you just
wrote, **stop**. It once stood at 55 and `migrate` would have replayed
them all against production.

## Merge, deploy, then prove it still works

```bash
git fetch origin -q
git checkout main && git merge --ff-only origin/main
git merge --no-ff -m "Merge branch '<branch>'" <branch>
corepack pnpm run check && corepack pnpm test && corepack pnpm run build
git push origin main
```

Render deploys on push. **Deploying is not finishing.** Wait for the new
build and prove the platform still answers:

```bash
# the running build, not the dashboard badge
curl -s -o /dev/null -w "%{http_code}\n" https://staff.barkinbeautiful.com.au/
curl -s -o /dev/null -w "%{http_code}\n" https://staff.barkinbeautiful.com.au/api/stripe/webhook   # 405 = new code
curl -s -o /dev/null -w "%{http_code}\n" https://staff.barkinbeautiful.com.au/clients/1162
```

Then confirm your own change actually shipped, by fetching the built
asset and grepping for a string only the new code contains — the deploy
can succeed while serving a cached entry point:

```bash
curl -s https://staff.barkinbeautiful.com.au/ -o /tmp/i.html
main=$(grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' /tmp/i.html | head -1)
curl -s "https://staff.barkinbeautiful.com.au$main" -o /tmp/m.js
chunk=$(grep -oE '<Page>-[A-Za-z0-9_-]+\.js' /tmp/m.js | head -1)
curl -s "https://staff.barkinbeautiful.com.au/assets/$chunk" | grep -c "<a string from your change>"
```

A read-only database check is worth doing too when the change touches
data — counts before and after, so a regression is visible rather than
inferred.

## If it breaks

Alone, at 2am, revert first and diagnose after:

```bash
git revert -m 1 <merge-sha> && git push origin main
```

Render redeploys in minutes. A migration that has already run is safe to
leave: the extra nullable columns are inert to the old code. **Never drop
a column to undo a deploy** — that is the one move that makes it worse.

Say plainly in the morning report what broke, what you reverted, and
what you think caused it.

## Still needs a human, whatever else is agreed

These are not approval-gated, they are **off**:

- **Sending anything to a real client** — SMS, email, a card link, a
  mass text. Building and shipping the feature unattended is fine;
  triggering a send is not. `MASS_TEXT_ENABLED` stays unset unless Andy
  sets it.
- **Moving money.** Charges, refunds, starting or cancelling a
  subscription on a real client.
- **Deleting or overwriting client data.** One row to fix a verified bug
  is judgement; a bulk update is his call.
- **Force-pushing**, rewriting history, or deleting a branch with work on
  it.
- **Spending.** Billing limits, plan changes, new paid services.
- **Anything a review flagged that you could not fix.** Branch it and
  say so; do not ship a known defect because the gate happens to be
  green.

## Leave a report

He reads this before he reads the code. Say, in order:

1. **What shipped**, in one line each, with commit SHAs.
2. **The gate result** — the real numbers, every time.
3. **What you verified in production**, and how.
4. **What you did not do, and why** — this is the most useful part.
5. **What needs him** — decisions, sends, anything branched.

Be straight about mistakes. A reverted deploy reported plainly is a
better morning than a quiet one he discovers at the salon.
