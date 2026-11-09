import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

/**
 * Every dialog in the app must be able to show its own bottom.
 *
 * `dialog.test.tsx` proves the shared component scrolls by default and that
 * a dialog MAY take the scrolling over with `flex flex-col overflow-hidden`.
 * Nothing proved that a dialog which takes it over then bounds itself. This
 * does, across every call site, by rendering each one's real `className`
 * through the real component and reading the class list the browser would
 * get. It is a delegation check, not a source grep for behaviour: what goes
 * wrong is which classes survive tailwind-merge, and that is invisible from
 * reading either half.
 *
 * Andy, 10/11/2026, with a photo of the Messages thread on his phone:
 * "Can't scroll down to see more messages on mobile view."
 *
 * The thread dialog took `overflow-hidden` for its rounded corners and gave
 * itself no height, so it kept the shared `max-h` and lost the only thing
 * that made the overflow reachable. Measured in a browser at 375x812 before
 * the fix: a 780px content box holding 2,539px of conversation, a message
 * list handed unbounded height so it never became a scroller (clientHeight
 * 2,415 = scrollHeight 2,415, scrollTop stuck at 0), and the reply box 1,760px
 * below the fold. Nothing scrolled, in a dialog whose whole job is a long list.
 *
 * So a dialog is sound if EITHER it scrolls itself, OR it has a definite
 * height — in which case an inner `flex-1 min-h-0 overflow-y-auto` child is
 * the scroller and the composer stays pinned, which is what a messaging app
 * should do anyway. `max-h` alone is NOT enough, and that is the whole bug.
 */

const CLIENT_SRC = resolve(process.cwd(), "client/src");

/**
 * Call sites whose className is composed at runtime and cannot be read here.
 * Each needs a reason, not just an entry.
 */
const EXEMPT: Record<string, string> = {
  "client/src/components/ui/command.tsx":
    'className is cn("p-0", className) — composed from the caller\'s, and p-0 ' +
    "does not touch the overflow, so the shared overflow-y-auto survives.",
};

function tsxFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(full, found);
    /* A dialog inside a test file is a fixture, not a dialog staff can
       open. Matched on ".test" anywhere in the name rather than on the
       extension, because something on this machine leaves macOS-style
       copies beside real files — "dialog.reachable.test 2.tsx" — and a
       filter anchored to the end of the name read that as a component
       and reported its own fixtures as unreadable call sites. The
       copies are gitignored, so it only ever failed locally, which is
       the worst place for a suite to go red for no reason. */
    else if (full.endsWith(".tsx") && !full.includes(".test"))
      found.push(full);
  }
  return found;
}

type CallSite = {
  where: string;
  file: string;
  className: string | null;
  side: "center" | "right";
};

/**
 * The attribute text of one `<DialogContent …>` opening tag.
 *
 * Walked rather than matched with a lazy regex, because a Tailwind arbitrary
 * variant contains a bare `>`: `[&>[data-slot=dialog-close]]:hidden` in
 * Staff.tsx ends the tag early for any regex that stops at the first one, and
 * that call site then reads as having no className at all.
 */
function openingTag(source: string, from: number): string | null {
  let quote: string | null = null;
  let depth = 0;
  for (let i = from; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote && source[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ">" && depth === 0) return source.slice(from, i);
  }
  return null;
}

/**
 * Every `<DialogContent …>` in the shipped client.
 *
 * A className written as an expression comes back null so the test FAILS on
 * it rather than quietly skipping it — a check that silently shrinks is the
 * failure mode `staffPortalAccess.test.ts` had. No className at all is sound,
 * not unreadable: that dialog keeps the base.
 */
function dialogContentCallSites(): CallSite[] {
  const sites: CallSite[] = [];
  for (const file of tsxFiles(CLIENT_SRC)) {
    const source = readFileSync(file, "utf8");
    const opener = /<DialogContent\b/g;
    let match: RegExpExecArray | null;
    while ((match = opener.exec(source))) {
      const attrs = openingTag(source, match.index + match[0].length);
      const relFile = relative(process.cwd(), file);
      const where = `${relFile}:${source.slice(0, match.index).split("\n").length}`;
      const written =
        attrs === null
          ? null
          : /className=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(attrs);
      sites.push({
        where,
        file: relFile,
        className: written
          ? (written[1] ?? written[2] ?? "")
          : attrs !== null && !/className=/.test(attrs)
            ? ""
            : null,
        side: attrs !== null && /side="right"/.test(attrs) ? "right" : "center",
      });
    }
  }
  return sites;
}

/** The class list the browser actually receives, from the real component. */
function renderedClasses(site: CallSite): string[] {
  const { unmount } = render(
    <Dialog open onOpenChange={() => {}}>
      <DialogContent side={site.side} className={site.className ?? undefined}>
        <DialogTitle>Sample</DialogTitle>
      </DialogContent>
    </Dialog>
  );
  const cls =
    document.querySelector('[data-slot="dialog-content"]')?.className ?? "";
  unmount();
  return cls.split(/\s+/).filter(Boolean);
}

/** The dialog box itself scrolls, so anything below the fold is reachable. */
function scrollsItself(classes: string[]): boolean {
  return classes.some(c =>
    [
      "overflow-auto",
      "overflow-scroll",
      "overflow-y-auto",
      "overflow-y-scroll",
    ].includes(c)
  );
}

/**
 * The dialog has a definite height, so a flex child can be given the leftover
 * space and scroll inside it. `max-h` does NOT count: a box with only a
 * maximum still hands its children unbounded height, which is exactly how the
 * thread dialog broke.
 */
function hasDefiniteHeight(classes: string[]): boolean {
  return (
    classes.some(c => /^h-(\[|full$|screen$|dvh)/.test(c)) ||
    classes.includes("inset-y-0")
  );
}

describe("every dialog can show its own bottom", () => {
  const sites = dialogContentCallSites();

  it("finds every DialogContent in the client", () => {
    // Counted, not spot-checked: if this falls, the sweep below is passing
    // because it stopped looking, not because the dialogs are sound.
    expect(sites.length).toBeGreaterThanOrEqual(77);
  });

  it("can read the className of every one of them", () => {
    const unreadable = sites
      .filter(
        site => site.className === null && EXEMPT[site.file] === undefined
      )
      .map(site => site.where);
    expect(unreadable).toEqual([]);
  });

  it("leaves no dialog clipped with nothing to scroll", () => {
    const stranded = sites
      .filter(site => site.className !== null)
      .filter(site => {
        const classes = renderedClasses(site);
        return !scrollsItself(classes) && !hasDefiniteHeight(classes);
      })
      .map(site => `${site.where} → ${site.className}`);
    expect(stranded).toEqual([]);
  });

  it("would catch the Messages thread dialog as it stood on 10/11/2026", () => {
    // Without this the sweep above could go green by accident if the rule
    // stopped matching anything at all.
    const broken = renderedClasses({
      where: "the 10/11/2026 regression",
      file: "client/src/pages/Messages.tsx",
      side: "center",
      className:
        "max-w-[420px] gap-0 overflow-hidden rounded-[26px] p-0 lg:hidden",
    });
    expect(broken).not.toContain("overflow-y-auto");
    expect(scrollsItself(broken)).toBe(false);
    expect(hasDefiniteHeight(broken)).toBe(false);
  });
});
