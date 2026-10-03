---
name: task-queue
description: Keep the running list of outstanding work visible and agreed. Use whenever the user adds a task mid-session, adds one while another is half-built, asks "what's left", OR whenever a piece of work just finished and nothing obvious is queued behind it — do not wait to be asked. Produces the outstanding list including unmerged branches and applied-but-unshipped migrations, a recommended priority order with the reasoning, and asks the user to confirm or reorder before the next task starts. Exists because this repo is a live salon's production system and the cost of picking the wrong thing next is a day of salon disruption, not a wasted hour.
---

# Outstanding work, and what to do next

## Produce it unprompted when something finishes

Andy works in bursts and adds tasks mid-turn, so by the time a piece
lands there are usually four more half-remembered ones. **When a piece of
work completes and nothing is obviously queued behind it, produce the
list without being asked.** The moment after something ships is when he
is deciding what is next, and that is the moment the list is worth
having. Do not produce it after every commit inside a larger piece —
only when the piece itself is done.

## Gather it from the repo, not from memory

A list built from recollection misses the things that matter most,
because the risky items are the ones that are *half* done. Check:

```bash
git branch -r --no-merged origin/main        # work that exists but is not live
git log origin/main..HEAD --oneline          # local commits not pushed
git status --porcelain                       # uncommitted work
```

And the migration ledger, which is the one that bites: a migration
applied to the database with its code unmerged is a silent half-state
that no branch listing shows.

```bash
node -e 'require("dotenv").config({quiet:true});const m=require("mysql2/promise"),f=require("fs");
(async()=>{const c=await m.createConnection({uri:process.env.DATABASE_URL,ssl:{minVersion:"TLSv1.2",rejectUnauthorized:true}});
const [[r]]=await c.query("SELECT MAX(created_at) n FROM __drizzle_migrations");
const j=JSON.parse(f.readFileSync("drizzle/meta/_journal.json","utf8"));
console.log(j.entries.filter(e=>e.when>Number(r.n)).length,"outstanding");await c.end();})()'
```

## What belongs on the list

Four kinds, and the last is the one usually forgotten:

1. **Code that is written but not live** — unmerged branches, unpushed
   commits, uncommitted files.
2. **Decisions only Andy can make** — which Stripe account, whether to
   cap discounts, how a client pays.
3. **Actions that need a human** — anything that sends to a client,
   moves money, or needs his login.
4. **Things found along the way and never chased** — data gaps, bugs
   noticed while doing something else. These never get raised again
   unless the list raises them, and they are often the oldest items on
   it.

## Ordering

Order by what it costs to leave undone, not by what is nearly finished:

1. **Anything a client will notice today** — a send that is waiting, a
   payment that will fail, a dead link.
2. **Half-states** — a migration applied with its code unmerged, a
   feature shipped without the data behind it. These rot quietly and the
   context to finish them is already lost by next week.
3. **Decisions blocking other work**, with what each one unblocks.
4. **Everything else**, newest first — older items have usually survived
   because they do not matter.

Say what each item costs if it waits. "Not done yet" is not a reason to
do something.


Andy adds tasks as they occur to him, often several while something else is
half-finished. That is how he works and it is not a problem to solve — but
picking up whatever arrived last is how a half-built feature gets left in the
tree and how something that is costing the salon money today waits behind
something cosmetic.

**Every time a new task arrives, produce the list and ask.** Not once a
session, not at the end. Every time.

## What to produce

Three things, in this order, and keep it short enough to read on a phone:

1. **The outstanding list.** Everything not finished, including what is
   half-built right now and anything blocked. One line each. Say where each
   one actually stands — "server done, no UI yet" beats "in progress".
2. **The recommended order, with one line of reasoning each.** State it as a
   recommendation, not a question. Andy is paying for judgement; "what would
   you like first?" with no opinion is not judgement.
3. **The ask.** "Happy with that order, or reshuffle?" Then keep working on
   the current item while waiting — do not down tools for an answer that may
   take an hour to arrive.

## How to rank

In descending order of what actually matters here:

1. **Something is broken for the salon right now.** Staff cannot check a dog
   in, a client got the wrong message, money is wrong on a screen. This
   always goes first, ahead of anything else, however small.
2. **A deadline outside our control.** Lauren's pilot clients start Tuesday;
   a migration that has to land before code merges.
3. **Half-built work already in the tree.** Finishing is cheap while the
   context is loaded and expensive next week. Say so when it is the reason.
4. **Blocked-but-startable work.** If a task is blocked on a key, an ID
   check, or the user's own action, do the unblocked parts and name the
   blocker in the list rather than leaving the whole item untouched.
5. **Visible-but-cosmetic.** Alignment, spacing, where a menu sits. These are
   genuinely worth doing — Andy notices them because the staff notice them —
   but they come after money and breakage.
6. **Everything else.**

Two things that are NOT ranking criteria: how recently it was asked for, and
how interesting it is to build.

## Rules

- **Never silently drop a task.** If something has fallen off, say it fell off
  and where it is now. A task the user mentioned once and never again is still
  outstanding until they say otherwise.
- **Never reorder on your own authority after they have answered.** Their
  order wins. If new information changes the picture — a breakage appears, a
  blocker clears — say what changed and re-ask.
- **Say what is blocked and on whom.** "Stripe: needs the real test key in
  .env, which only you can add" is actionable. "Stripe: blocked" is not.
- **Count the branches.** Work spread across several unmerged branches is part
  of the outstanding list. Name the branch and whether it is pushed, because
  an unpushed branch is invisible to the other AI session working this repo
  (see `concurrent-sessions`).
- **Finish or park, never abandon.** If the answer moves you off something
  half-built, commit it to its branch and push it first, then say where it
  stopped.

## Format

Plain markdown, no table unless there are more than about six items.

```
**Outstanding**
1. Split payments — migration applied, server done, no UI yet (feat/split-payments, pushed)
2. Stripe — card-on-file + real retry built; blocked on the live test key in .env (yours)
3. Calendar alignment — fixed and pushed, waiting on your merge (fix/calendar-sidebar-fit)

**I'd do them in this order**
1. … because …
2. … because …

Happy with that, or reshuffle?
```
