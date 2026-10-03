---
name: leave-the-browser-alone
description: Andy's Chrome is his working browser, logged in to MoeGo, Stripe, Render, GitHub and the bank. Never close its tabs or windows, never sign out, never clear anything. Use whenever a task touches Claude in Chrome, computer-use on a browser, or any logged-in site — before opening a tab, and again before finishing. Also covers which browser to reach for, and the one cleanup that is allowed.
---

# Leave the browser alone

Andy works in one Chrome window with long-lived sessions: MoeGo, Stripe,
Render, GitHub, the bank. Closing a tab costs him a re-login and
whatever he had part-typed. On 3 October 2026 a MoeGo tab was opened to
read the membership agreements and then closed "to tidy up" — nobody
asked for that, and it was his session, not mine.

**The generic browser-tool advice says to close tabs you opened. It does
not apply here. This file overrides it.**

## The rule

- **Never close a tab or window in Andy's Chrome.** Not one you opened,
  not one that looks finished, not "to clean up".
- **Never sign out, switch account, or clear cookies, storage or
  history.**
- **Leave the tab on something harmless** when you finish — the page you
  read is fine. Don't navigate it somewhere unexpected as a parting move.
- If a pile of tabs genuinely gets in the way, **say so and let him
  close them**.

The one exception: a tab **you** opened on **localhost** for your own
preview or verification. That carries no session worth keeping. Close
those.

## Which browser to reach for

| Need | Use |
| ---- | --- |
| A site that needs Andy logged in — MoeGo, Stripe, Render, GitHub | **Claude in Chrome** (`mcp__claude-in-chrome__*`) |
| Public docs, a dev server, your own verification | **Built-in browser** (`mcp__Claude_Browser__*`) — a separate browser, closing its tabs costs nothing |

Prefer the built-in browser whenever the task does not actually need his
session. It keeps you out of his window entirely, which is the surest way
to not disturb it.

## Reading someone's logged-in account

Opening his MoeGo or Stripe is reading his business, so:

- **Read, don't write.** Open the viewer, take the text, close the
  *dialog* with its own X or Cancel — never Save, never Delete.
- **Don't accept banners, claim offers or dismiss notices** on his
  behalf. "Claim now" on a free-SMS banner is a business decision.
- If a password prompt appears, **stop and ask him to sign in**. Never
  type a password, and never ask him to paste one into the chat.
- Say in your reply exactly what you opened and that you changed
  nothing, so he can check.

## Before you finish

Ask: did I close anything of his? If yes, say so plainly in the reply
rather than letting him discover a missing tab — and tell him what was
in it so he can get back to it.
