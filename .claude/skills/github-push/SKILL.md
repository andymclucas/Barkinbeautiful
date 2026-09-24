---
name: github-push
description: Get work from this machine onto GitHub without a human present — branch, verify, commit, push. Use whenever asked to push, open a PR, "save this to GitHub", or to work unattended/overnight and leave results ready for review. Covers the three preconditions for unattended pushing (SSH key, SSH remote, permission rule), diagnoses the specific failure when a push hangs or is refused, and enforces that main is production and is never pushed to directly.
---

# Pushing to GitHub from this machine

`main` is production — Render auto-deploys it. **Never push to `main`.** Work goes
on a branch and the human merges.

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

## 4. One-time setup (the human must run this)

Creating credentials is deliberately outside what can be done autonomously:
generating a key or writing `~/.ssh/config` is blocked as credential persistence,
and adding the key to GitHub requires their account. Hand them this, verbatim:

```bash
# 1. Create a key (no passphrase, so unattended pushes work)
ssh-keygen -t ed25519 -C "your@email.com" -f ~/.ssh/id_ed25519 -N ""

# 2. Load it and persist in the macOS keychain
cat >> ~/.ssh/config <<'CFG'

Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  AddKeysToAgent yes
  UseKeychain yes
CFG
chmod 600 ~/.ssh/config ~/.ssh/id_ed25519
ssh-add --apple-use-keychain ~/.ssh/id_ed25519

# 3. Copy the PUBLIC key
pbcopy < ~/.ssh/id_ed25519.pub

# 4. Paste it at https://github.com/settings/ssh/new  (title: this Mac)

# 5. Point the repo at SSH and verify
git remote set-url origin git@github.com:<owner>/<repo>.git
ssh -T git@github.com
```

A passphrase-less key is what makes overnight work possible. The trade-off is a
private key readable by anything running as that user — reasonable on a personal
machine, and revocable instantly by deleting the key from GitHub.

An alternative is a Personal Access Token stored in the keychain, but tokens
expire and the failure mode is a hang months later. Prefer SSH.

## 5. The permission rule

A blanket deny on `git push` blocks branch pushes too, not just `main`:

```json
"deny": [ "Bash(git push:*)" ]
```

Replace it with rules that guard what actually matters, leaving branches free:

```json
"deny": [
  "Bash(git push origin main:*)",
  "Bash(git push --force:*)",
  "Bash(git push -f:*)"
]
```

Permission rules cannot be edited autonomously — that is self-modification, and is
blocked. Ask the human to make this change; state exactly which file and line.

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
