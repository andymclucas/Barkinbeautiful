---
name: task-queue
description: Keep the running list of outstanding work visible and agreed. Use whenever the user adds a task mid-session, adds one while another is half-built, or asks "what's left". Produces the outstanding list, a recommended priority order with the reasoning, and asks the user to confirm or reorder before the next task starts. Exists because this repo is a live salon's production system and the cost of picking the wrong thing next is a day of salon disruption, not a wasted hour.
---

# Outstanding work, and what to do next

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
