---
name: branch-when-blocked
description: When work needs Andy's approval, a permission this session does not have, or a decision only he can make — push it to a branch on GitHub and carry on, rather than stopping and waiting. Use whenever a tool call is denied, a migration needs applying, a change would deploy to the live salon, or a question would otherwise block progress. Covers what must still never be done unasked, and how to leave a branch someone can review or discard months later.
---

# Branch it, don't wait

Andy works across time zones from this session and is often asleep when
something needs deciding. Stopping with a question wastes the night; so
does guessing and shipping it to a live salon.

**The default is: finish the work, push it to a branch, say what it needs.**
A branch costs nothing, is visible on GitHub, and is discarded with one
command. An unpushed working tree is invisible to Andy and to the other AI
session, and is lost when the machine restarts.

## When this applies

- A tool call is **denied** — production deploy, bulk database write, a
  migration. Build the change anyway and branch it.
- The work would **merge to `main`**, which Render deploys to the salon.
- A **question** would block progress: build the most defensible version,
  branch it, and put the question in the final message.
- A **review found problems** you have fixed but cannot verify live.
- You are **mid-task and out of road** — branch what exists rather than
  leaving it uncommitted.

## What to do

1. **Finish the work first.** A half-built branch is worth less than a
   whole one. If you genuinely cannot finish, say so in the commit.
2. **Run the gate**: `corepack pnpm run check && corepack pnpm test && corepack pnpm run build`.
   A branch that does not compile is not a reviewable branch.
3. **Branch from current `main`**, not from whatever you were on:
   ```bash
   git fetch origin -q
   git checkout main && git merge --ff-only origin/main
   git checkout -b <type>/<short-description>
   ```
   `fix/`, `feat/`, `chore/`, `docs/` — match the surrounding history.
4. **Commit with the reasoning**, not just the change. Andy may read it in
   a fortnight with no memory of the conversation. Say what was wrong, what
   you did, and what you deliberately did not do.
5. **Push immediately**: `git push -u origin <branch>`. A pushed branch is
   a claim the other AI session can see via `git ls-remote --heads origin`.
6. **Say in your reply**: the branch name, the commit SHA, the gate result,
   and the exact command Andy runs to merge it.

## Make the branch self-explaining

The commit message is the handover. Include, when they apply:

- **What it needs from him** — "apply migration 0066 before merging",
  "decide whether groomers should be capped below 20%".
- **What is deliberately off** — a feature behind an environment flag, a
  path not built. `MASS_TEXT_ENABLED` is the pattern: shipped, inert until
  switched on.
- **What was verified and how** — "gate green, 565 tests", "confirmed
  against live data: 9,327 reachable mobiles".
- **What a reviewer should doubt** — the parts you are least sure of.

## Migrations change the order

A branch carrying a migration cannot simply be merged. Say so explicitly
and give both commands, in order:

```bash
# 1. apply, from the branch
git checkout <branch> && corepack pnpm exec drizzle-kit migrate
# 2. only then merge
git checkout main && git merge --no-ff <branch> && git push origin main
```

Code that reaches `main` before its migration breaks every bare select on
that table. See `db-migration`.

## Rolling back

Say this plainly when handing over, because it is what makes a branch
cheap:

- **Not merged**: `git push origin --delete <branch>` and it never existed.
- **Merged, not deployed**: `git revert -m 1 <merge-sha>`.
- **Merged and deployed**: revert and push; Render redeploys in minutes.
- **A migration has run**: reverting the code is safe — the extra nullable
  columns are inert to old code. Dropping them is a separate, deliberate
  job and must come *after* the code is gone.

## What branching does NOT license

A branch is not permission. Still never, without Andy asking in that
conversation:

- **Push to `main`.** Render deploys it to a live salon.
- **Apply a migration** against the real database.
- **Send anything to a real client** — SMS, email, a card link. Building
  the send is fine; triggering it is not.
- **Move money.** Charges, refunds, subscriptions.
- **Bulk-write production data.** One row for a verified fix is judgement;
  hundreds is his call.
- **Work around a denial.** A denied tool call is an answer. Branch the
  work and say what was refused and why you think it is needed.

## Why

Across one long session the denials were: merging to `main`, applying
migrations, and a bulk update of 61 client records. Every one was correct
— each would have touched a live salon unattended. Branching turned all of
them from dead ends into five-minute reviews the next morning, and nothing
was lost waiting.
