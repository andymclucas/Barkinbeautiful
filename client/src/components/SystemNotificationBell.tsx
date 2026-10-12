import { useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canAdministerStaff } from "@shared/staffAdministrators";
import { describeSystemNotification } from "@shared/systemNotifications";
import { getActiveTimeZone } from "@/lib/timezone";

/**
 * The owner's own bell: who was given access, and which clients have started
 * using their portal.
 *
 * Separate from the main bell on purpose. That one is work — messages to
 * answer, voicemails to return, a payment that failed. This one is a record
 * of things that have already happened and need nobody's action, and mixing
 * the two trains people to dismiss the wrong one.
 *
 * Lauren and Andy only. The guard is here AND on the server; this hides the
 * icon, the server is what actually refuses. `canAdministerStaff` is the same
 * list the revenue targets use, and deliberately not `users.role === "admin"`
 * — six of the eight users hold that, four of them groomers who were made
 * admins to reach the salon floor.
 */
export default function SystemNotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const allowed = canAdministerStaff(user ?? null);

  const { data } = trpc.sms.getSystemNotifications.useQuery(
    { limit: 20 },
    { enabled: allowed, refetchInterval: 120_000, refetchOnWindowFocus: true },
  );
  const markRead = trpc.sms.markSystemNotificationRead.useMutation({
    onSuccess: () => utils.sms.getSystemNotifications.invalidate(),
    onError: (error) => toast.error(error.message || "Could not dismiss that"),
  });
  const [, setLocation] = useLocation();

  // Nothing rendered at all for everyone else — not a disabled icon, which
  // only advertises that there is something they cannot see.
  if (!allowed) return null;

  const items = data?.items ?? [];
  const unread = data?.unreadCount ?? 0;

  /** Full timestamp, not "2d ago": this is a record, and records carry dates. */
  const stamp = (at: string | Date) =>
    new Date(at).toLocaleString("en-AU", {
      timeZone: getActiveTimeZone(),
      day: "numeric", month: "short", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 transition-colors hover:bg-card/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={unread > 0 ? `${unread} unread system notifications` : "System notifications"}
          title="System — access and portal activity"
        >
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-sky-600 px-1 text-[10px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="flex max-h-[70vh] w-[360px] max-w-[calc(100vw-2rem)] flex-col p-0" align="end">
        <div className="shrink-0 border-b px-4 py-3">
          <h3 className="text-sm font-semibold">System</h3>
          <p className="text-xs text-muted-foreground">
            Access and portal activity · owner only
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">Nothing yet</p>
          ) : (
            items.map((item: any) => {
              const { title, detail } = describeSystemNotification(item);
              return (
                <div
                  key={item.id}
                  className={`flex w-full items-start gap-1 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-accent ${item.readAt ? "opacity-60" : ""}`}
                >
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      if (!item.readAt) markRead.mutate({ id: item.id });
                      if (item.clientId) { setOpen(false); setLocation(`/clients/${item.clientId}`); }
                    }}
                  >
                    <p className="truncate text-sm font-medium">{title}</p>
                    {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
                    <p className="mt-1 text-[11px] tabular-nums text-muted-foreground/80">{stamp(item.createdAt)}</p>
                  </button>
                  {!item.readAt && (
                    <button
                      className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Dismiss"
                      title="Dismiss"
                      onClick={(e) => { e.stopPropagation(); markRead.mutate({ id: item.id }); }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
