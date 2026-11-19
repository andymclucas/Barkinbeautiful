import { X } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canAdministerStaff } from "@shared/staffAdministrators";
import { describeSystemNotification } from "@shared/systemNotifications";
import { getActiveTimeZone } from "@/lib/timezone";

/**
 * The owner's system record: who was given access, and which clients have
 * started using their portal.
 *
 * This used to be its own icon beside the bell. Since 19/11/2026 it is the
 * System tab inside the one bell (shared/notificationTabs.ts), so this file
 * exports the LIST and the hook that feeds it, not a button.
 *
 * It is still kept apart from the work: its own tab, its own read state.
 * Messages are work; this is a record of things that have already happened
 * and need nobody's action.
 *
 * Lauren and Andy only. The guard is here AND on the server; this hides the
 * list, the server is what actually refuses. `canAdministerStaff` is the same
 * list the revenue targets use, and deliberately not `users.role === "admin"`
 * — six of the eight users hold that, four of them groomers who were made
 * admins to reach the salon floor.
 */
export function useSystemNotifications() {
  const { user } = useAuth();
  const allowed = canAdministerStaff(user ?? null);
  const { data } = trpc.sms.getSystemNotifications.useQuery(
    { limit: 20 },
    { enabled: allowed, refetchInterval: 120_000, refetchOnWindowFocus: true },
  );
  return { allowed, items: (data?.items ?? []) as any[], unread: allowed ? (data?.unreadCount ?? 0) : 0 };
}

export function SystemNotificationList({ items, onNavigate }: { items: any[]; onNavigate: () => void }) {
  const utils = trpc.useUtils();
  const markRead = trpc.sms.markSystemNotificationRead.useMutation({
    onSuccess: () => utils.sms.getSystemNotifications.invalidate(),
    onError: (error) => toast.error(error.message || "Could not dismiss that"),
  });
  const [, setLocation] = useLocation();

  /** Full timestamp, not "2d ago": this is a record, and records carry dates. */
  const stamp = (at: string | Date) =>
    new Date(at).toLocaleString("en-AU", {
      timeZone: getActiveTimeZone(),
      day: "numeric", month: "short", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });

  if (items.length === 0) return null;
  return (
    <>
      {items.map((item: any) => {
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
                if (item.clientId) { onNavigate(); setLocation(`/clients/${item.clientId}`); }
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
      })}
    </>
  );
}
