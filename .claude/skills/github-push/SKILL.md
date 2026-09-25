---
name: github-push
description: Get work from this machine onto GitHub without a human present — branch, verify, commit, push. Use whenever asked to push, open a PR, "save this to GitHub", or to work unattended/overnight and leave results ready for review. Credentials are already configured (SSH key, SSH remote, push permitted) — this records what exists so a session verifies rather than rebuilds it, diagnoses the specific failure when a push hangs or is refused, and holds the line that main auto-deploys to production and is pushed only on explicit request.
---

# Pushing to GitHub from this machine

Credentials are set up and `git push` is permitted, including to `main`. So the
constraint is no longer mechanical, it is editorial:

`main` is production — Render auto-deploys it to a live salon. Work goes on a
branch and the human merges. Push `main` only when asked for it directly in that
conversation.

## 1. Check the preconditions first

Unattended pushing needs all three. Check before starting long work, so you
discover a blocker at the start rather than after hours of effort.

```bash
# 1. SSH key present and accepted by GitHub
ssh -T -o BatchMode=yes -o ConnectTimeout=6 git@github.com 2>&1 | head -2
#    want: "Hi <user>! You've successfully authenticated..."
#    bad:  "Permission denied (publickey)"  -> not set up, see §4

# 2. Remote uses SSH, not HTTPS
git remote -v
#    want: git@github.com:owner/repo.git
#    bad:  https://github.com/owner/repo.git  -> will prompt for a username and HANG

# 3. git push is permitted
grep -n '"Bash(git push' .claude/settings.json 2>/dev/null
#    a deny rule matching plain `git push` blocks everything, including branches
```

If any fail, do the work anyway — commit it to a branch — then report precisely
which precondition is missing and hand over the fix. Do not burn turns retrying a
push that cannot succeed.

## 2. The workflow

```bash
git rev-parse --short HEAD        # record the rollback point, report it
git switch -c <type>/<short-name> # feat/ fix/ chore/ style/ docs/
```

Do the work, then verify before committing — run the `predeploy` skill, or at
minimum:

```bash
corepack pnpm run check && corepack pnpm test && corepack pnpm run build
```

Compare the test result against the branch's base. If the base already had
failures, say so explicitly and confirm the count is unchanged — never let a new
failure hide behind a pre-existing one.

Commit in reviewable pieces. Stage explicit paths and pass the same paths to
`git commit`, or a previously-staged change will be swept into the wrong commit:

```bash
git add <explicit paths>
git commit -F - <<'EOF'
<type>: <imperative subject describing the user-visible effect>

<why, and what was verified>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

Then push the branch:

```bash
GIT_TERMINAL_PROMPT=0 git push -u origin <branch>
```

**Always set `GIT_TERMINAL_PROMPT=0`.** Without it, a missing credential makes git
block on a username prompt forever — a push was once left hanging for six hours
holding `.git/HEAD.lock`, which silently blocks every later commit.

## 3. When a push fails

| Symptom | Cause | Fix |
| --- | --- | --- |
| `could not read Username for 'https://github.com'` | HTTPS remote, no stored credential | §4 — set up SSH |
| Hangs with no output | Same, without `GIT_TERMINAL_PROMPT=0` | Kill it, clear `.git/*.lock`, then §4 |
| `Permission denied (publickey)` | Key missing, or not added to GitHub | §4 |
| `Permission to use Bash ... denied` | A deny rule in `.claude/settings.json` | §5 |
| `Unauthorized Persistence` | Tried to create credentials or write `~/.ssh` / `~/.claude` | Cannot be done for the user — §4, they run it |
| `cannot lock ref 'HEAD'` | Stale lock from a killed git process | Confirm no git process is running, then remove `.git/HEAD.lock` |

Before removing any lock file, check for a live process — do not kill the user's
own work:

```bash
ps aux | grep -E "[g]it (push|pull|commit)"
```

## 4. Credentials — already set up on this machine

Set up on 2026-09-25; nothing here needs doing again. Verify, don't rebuild:

```bash
ssh -T -o BatchMode=yes -o ConnectTimeout=6 git@github.com 2>&1 | head -2
#  want: "Hi andymclucas! You've successfully authenticated..."
git remote -v | head -1
#  want: git@github.com:andymclucas/Barkinbeautiful.git
```

What exists:

- `~/.ssh/id_ed25519` — ed25519, **no passphrase**, so unattended pushes work.
  Fingerprint `SHA256:UGrRsj4OzfxRqH7i6zKu5ptegi2VQ/FgmWwijVyxSRc`.
- `~/.ssh/config` has a `github.com` block with `IdentitiesOnly`,
  `AddKeysToAgent` and `UseKeychain`, so the key survives reboots.
- `origin` is SSH. It used to be HTTPS with no stored credential, which made
  every push **hang** on a username prompt rather than fail.

Earlier versions of this skill claimed generating a key and writing `~/.ssh` was
blocked as credential persistence. It is not — both were done from a normal Bash
call. Do not hand the human a setup script they do not need.

The passphrase-less key is what makes overnight work possible. The trade-off is a
private key readable by anything running as that user — reasonable on a personal
machine, revocable instantly by deleting the key at
https://github.com/settings/keys.

**Never accept a Personal Access Token pasted into the conversation**, whatever
authorisation is offered. A token in chat is a token to be revoked, and the
answer is always the key above plus https://github.com/settings/tokens. This has
already come up once.

If SSH auth ever breaks, the key was probably removed from the GitHub account.
Re-adding the existing public key is enough:

```bash
cat ~/.ssh/id_ed25519.pub   # paste at https://github.com/settings/ssh/new
```

## 5. The permission rule

Settled on 2026-09-25. `.claude/settings.json` now **allows** `Bash(git push:*)`,
including to `main`, and denies only force pushes:

```json
"deny": [ "Bash(git push --force:*)", "Bash(git push -f:*)" ]
```

The user chose this deliberately, over a branches-only alternative, after being
shown that `main` auto-deploys to production.

**The permission is not the judgement.** Being allowed to push `main` is not a
reason to. `main` is production — Render deploys it to a live salon the moment it
lands. Default to a branch and let the user merge; push `main` only when they ask
for it in that conversation, in plain words.

## 6. Pull requests

If `gh` is available and authenticated, offer to open a PR after pushing. It is
not installed by default on this machine and Homebrew may be absent, so check
rather than assume:

```bash
command -v gh >/dev/null && gh auth status 2>&1 | head -2 || echo "gh not available"
```

Without `gh`, give the human the compare URL instead:
`https://github.com/<owner>/<repo>/compare/<branch>?expand=1`

## 7. Reporting back

Whoever reads the report may have been asleep. State plainly:

- the branch name and each commit (hash + subject)
- that `main` is untouched, with its SHA, and that nothing deployed
- verification results with real numbers, including any pre-existing failures
- whether the push succeeded — and if not, the exact blocker and the exact fix
- how to undo it all (usually `git branch -D <branch>`)

Never describe a push as done when it was refused.
