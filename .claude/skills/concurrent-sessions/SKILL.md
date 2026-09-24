---
name: concurrent-sessions
description: Stop two AI sessions working on this repo at once from colliding — Claude in the browser and Claude Code both commit here. Use at the START of any task that will edit files, before every commit, and before every push. Covers claiming work so the other session can see it, detecting that the other session has moved main under you, safe handling of stale .git locks, and what to do when you and the other session have touched the same file.
---

# Two sessions, one repo

Claude (browser) and Claude Code both work on this repository, often at the same
time, on the same machine and the same clone. They have collided repeatedly:
stale `.git` locks blocking commits, a half-switched working tree, `main` moving
mid-task, and one session reverting a design decision the other had just shipped
and the user had approved.

Assume the other session is running right now. These rules are cheap; a
collision is not.

## What does NOT identify the other session

**Do not key anything off the commit author.** Both sessions commit as
`Andy McLucas`, and the email has varied across `mclucas.andy@gmail.com` and
`andy@keystonepropertystrategies.com.au` for both. Author is not a discriminator.

What IS reliable:

- **Recorded SHAs.** Note what HEAD and `origin/main` were when you started. Any
  commit you did not make is the other session.
- **`git ls-remote --heads origin`.** A pushed branch is a visible claim.
- **`.git/*.lock`.** Someone is, or recently was, mid-operation.

## 1. Preflight — before editing anything

```bash
git fetch origin --prune
git status --porcelain                 # must be clean before you start
ls -la .git/*.lock 2>/dev/null         # nothing expected
git ls-remote --heads origin           # what has the other session claimed?
git log --oneline -8                   # what landed recently?
echo "START_HEAD=$(git rev-parse HEAD)  START_ORIGIN=$(git rev-parse origin/main)"
```

**Record `START_HEAD` and `START_ORIGIN` and keep them for the whole task.** They
are how you detect the other session moving underneath you.

Stop and ask the user first if:

- a remote branch exists that covers the same area you are about to touch;
- `git log` shows a commit in the last hour touching the same files, that you did
  not make;
- the working tree is dirty with changes that are not yours.

## 2. Claim your work — push the branch early

Never commit straight to `main`. Branch, and **push the branch as soon as it has
one commit**, even a work-in-progress one. An unpushed branch is invisible to the
other session; a pushed branch is a claim it can see.

```bash
git switch -c <type>/<short-topic>
# ... first commit ...
git push -u origin <type>/<short-topic>
```

`main` is production — Render deploys it. Merging is the user's decision, not
something to slip in at the end of a task.

## 3. Before every commit

```bash
ls .git/*.lock 2>/dev/null && echo "LOCK PRESENT — see §5"
git rev-parse HEAD        # still your last commit, or START_HEAD?
```

If HEAD is a commit you did not make, the other session committed into your
branch or you were moved onto another. **Stop. Do not commit on top of it.**
Read what landed, then tell the user what you found before continuing.

Commit with explicit paths, and pass the same paths to `git commit`:

```bash
git add <paths>
git commit --only <paths> -F - <<'EOF'
...
EOF
```

`git commit` with no pathspec sweeps in anything else that happens to be staged —
including the other session's work. This has already happened once here.

## 4. Before every push

```bash
git fetch origin --prune
git rev-parse origin/main          # compare against START_ORIGIN
git log --oneline START_ORIGIN..origin/main    # what arrived while you worked?
```

If `origin/main` has moved:

1. Read those commits. Do they touch your files? `git diff --stat START_ORIGIN..origin/main`
2. No overlap → rebase or merge, re-run the gate (`/predeploy`), push.
3. Overlap → **stop and report**. Do not resolve a conflict in the other
   session's work on your own judgement; you cannot see its instructions.

Never `git push --force` on a shared branch. Never push to `main` without the
user saying so in this conversation.

## 5. Stale `.git` locks

Every collision here left one. The rule is: **verify, then clear, then say so.**

```bash
ps aux | grep -E "[g]it (commit|push|merge|rebase|add|fetch)"   # live process?
ls -la .git/*.lock                                              # how old?
```

- **A live git process** → do not touch the lock. Wait, or tell the user. It may
  be theirs.
- **No process, lock older than ~60 seconds** → it is stale. Remove exactly the
  lock file and state plainly in your reply that you did, and why.

```bash
rm -f .git/HEAD.lock .git/index.lock
```

Never `rm -rf .git/*`, never remove a lock you have not just checked, and never
remove one silently.

## 6. If the working tree looks half-switched

Symptom: HEAD says one commit but the files on disk are from another — `git
status` shows dozens of modifications you did not make. This happens when a
branch switch is interrupted by a lock.

**Before restoring anything, prove nothing unique is at risk:**

```bash
git status --porcelain | grep '^??'                    # untracked files
git merge-base --is-ancestor <your-branch> origin/main # your work already remote?
git diff <your-branch> --stat                          # what actually differs
```

Only when every change is confirmed present in a commit that is on the remote:

```bash
git reset --hard origin/main
```

If anything is unaccounted for, stop and ask. A `--hard` reset over someone
else's uncommitted work is not recoverable.

## 7. When both sessions have touched the same thing

This is the expensive one, and it has already happened: one session shipped a
light sidebar the user had approved from a mockup; the other reverted it to dark
hours later. Neither was wrong in isolation — but the user lost work and had no
idea why the UI kept changing.

If you find the other session has changed something you built:

- **Do not revert it.** It may be exactly what the user asked for over there.
- Say what changed, which commit did it, and what it undid.
- Ask which direction they want. One of them is stale intent.

Equally, before you undo something that looks wrong: check `git log` for who
added it and when. Something committed twenty minutes ago by the other session is
a live decision, not debris.

## 8. Quick status for a report

```bash
echo "branch: $(git branch --show-current)"
echo "local:  $(git rev-parse --short HEAD)   origin/main: $(git rev-parse --short origin/main)"
echo "ahead $(git rev-list --count origin/main..HEAD) / behind $(git rev-list --count HEAD..origin/main)"
echo "clean: $([ -z "$(git status --porcelain)" ] && echo yes || echo no)"
git ls-remote --heads origin | awk '{print "claimed: "$2}'
```

Always tell the user when the other session moved something under you. They are
the only one who can see both conversations.
