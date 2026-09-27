import { useEffect, useRef } from "react";
import { buildThread, recentThread, type ThreadEntry, type ThreadMessageInput } from "@shared/messageThreadGrouping";
import { getActiveTimeZone } from "@/lib/timezone";

/**
 * An iMessage-style conversation, used both by the hover preview in the
 * conversation list and by the full thread view.
 *
 * One component on purpose: the two used to be separate blocks of JSX with
 * their own bubble styling, and they drifted. The preview also squashed its
 * bubbles — flex children shrink by default, so a long message was compressed
 * until its last line was clipped mid-sentence. `shrink-0` on every row is
 * what stops that, and it only has to be right in one place now.
 */

const bubbleTime = (at: number) =>
  at === 0
    ? ""
    : new Intl.DateTimeFormat("en-AU", {
        timeZone: getActiveTimeZone(),
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(at));

/** Corner radii that give a run of bubbles a single tail, as iOS does. */
function bubbleShape(outbound: boolean, isFirstOfGroup: boolean, isLastOfGroup: boolean) {
  if (outbound) {
    return [
      "rounded-2xl",
      isFirstOfGroup ? "rounded-tr-2xl" : "rounded-tr-md",
      isLastOfGroup ? "rounded-br-md" : "rounded-br-2xl",
    ].join(" ");
  }
  return [
    "rounded-2xl",
    isFirstOfGroup ? "rounded-tl-2xl" : "rounded-tl-md",
    isLastOfGroup ? "rounded-bl-md" : "rounded-bl-2xl",
  ].join(" ");
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div className="shrink-0 py-2 text-center">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}

function Bubble({
  entry,
  compact,
  showStatus,
}: {
  entry: Extract<ThreadEntry, { kind: "message" }>;
  compact: boolean;
  showStatus: boolean;
}) {
  const { message, outbound, isFirstOfGroup, isLastOfGroup, at } = entry;
  const status = typeof message.status === "string" ? message.status : null;

  return (
    <div className={`flex shrink-0 ${outbound ? "justify-end" : "justify-start"} ${isFirstOfGroup ? "mt-1.5" : "mt-0.5"}`}>
      <div className={`flex min-w-0 flex-col ${outbound ? "items-end" : "items-start"} max-w-[78%]`}>
        <div
          className={[
            "w-fit max-w-full break-words px-3.5 py-2 shadow-sm",
            compact ? "text-xs leading-snug" : "text-[15px] leading-[1.35]",
            bubbleShape(outbound, isFirstOfGroup, isLastOfGroup),
            outbound
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground dark:bg-slate-800 dark:text-slate-100",
          ].join(" ")}
        >
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        </div>
        {/* Only the last bubble of a run is stamped — a time under every line is
            what made the old thread look like a log rather than a conversation. */}
        {isLastOfGroup && (
          <p className="mt-0.5 px-1 text-[10px] text-muted-foreground">
            {bubbleTime(at)}
            {showStatus && outbound && status ? ` · ${status}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

export function MessageThread<M extends ThreadMessageInput>({
  messages,
  limit,
  compact = false,
  showStatus = false,
  emptyText = "No messages in this conversation yet.",
  autoScroll = false,
  className = "",
}: {
  messages: readonly M[];
  /** Preview mode: only the newest few. Omit for the whole conversation. */
  limit?: number;
  compact?: boolean;
  /** Show the delivery status beside an outgoing timestamp. */
  showStatus?: boolean;
  emptyText?: string;
  /** Open scrolled to the newest message, as a messaging app does. */
  autoScroll?: boolean;
  className?: string;
}) {
  const timeZone = getActiveTimeZone();
  const entries = limit === undefined ? buildThread(messages, timeZone) : recentThread(messages, timeZone, limit);

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoScroll) return;
    // `auto` rather than `smooth`: opening a thread should already be at the
    // bottom, not visibly travel there.
    endRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
  }, [autoScroll, entries.length]);

  if (entries.length === 0) {
    return <p className={`py-6 text-center text-sm text-muted-foreground ${className}`}>{emptyText}</p>;
  }

  return (
    <div className={`flex flex-col ${className}`}>
      {entries.map((entry) =>
        entry.kind === "day" ? (
          <DaySeparator key={entry.key} label={entry.label} />
        ) : (
          <Bubble key={entry.key} entry={entry as Extract<ThreadEntry, { kind: "message" }>} compact={compact} showStatus={showStatus} />
        ),
      )}
      <div ref={endRef} />
    </div>
  );
}

/** Initials for the avatar circle, e.g. "Katherine Poulton" -> "KP". */
export function contactInitials(name: string | null | undefined, fallback: string): string {
  const source = name?.trim() || fallback;
  // Unicode property escapes need an es6+ target, which this project's tsconfig
  // does not set — strip the obvious punctuation instead.
  const words = source.replace(/[^A-Za-z0-9\u00C0-\u024F\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "#";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** A stable, muted colour per contact so the list is scannable. */
export function contactColour(seed: string): string {
  const palette = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#f97316"];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}
