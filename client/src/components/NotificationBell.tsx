import { Bell, Phone, X } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";

function timeAgo(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const clearMissedCall = trpc.sms.clearMissedCall.useMutation({
    onSuccess: () => utils.sms.getUnreadPreview.invalidate(),
  });
  const { data } = trpc.sms.getUnreadPreview.useQuery(
    { limit: 6 },
    { refetchInterval: 20000, refetchOnWindowFocus: true }
  );

  // Real-time push: the moment a new inbound SMS or missed-call voicemail
  // transcript arrives, the server pushes an event over this connection and
  // we refresh immediately, instead of waiting for the next 20-second poll.
  // The 20s poll above stays as a fallback in case this connection ever
  // drops and doesn't reconnect.
  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === "new-message") {
          utils.sms.getUnreadPreview.invalidate();
          utils.sms.getThreads.invalidate();
          utils.sms.getLogs.invalidate();
        } else if (payload?.type === "missed-call") {
          utils.sms.getUnreadPreview.invalidate();
        }
      } catch {
        // ignore malformed events
      }
    };
    return () => source.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unreadCount = data?.unreadCount ?? 0;
  const recent = data?.recent ?? [];

  // Opening a missed call (to see the caller's client record, say) never
  // clears it \u2014 a missed call stays as a notification until someone
  // explicitly dismisses it with the X, regardless of how many times it's
  // been viewed, so it can't quietly slip past everyone.
  const openItem = (item: any) => {
    if (item.kind === "missed_call") {
      if (item.clientId) setLocation(`/clients/${item.clientId}`);
      else setLocation("/messages");
      return;
    }
    const params = item.clientId ? `clientId=${item.clientId}` : `toNumber=${encodeURIComponent(item.toNumber)}`;
    setLocation(`/messages?${params}`);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative h-9 w-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/12 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        >
          <Bell className="h-4 w-4 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0 flex flex-col max-h-[28rem]">
        <div className="px-4 py-3 border-b shrink-0">
          <h3 className="text-sm font-semibold">Notifications</h3>
          <p className="text-xs text-muted-foreground">
            {unreadCount === 0 ? "You're all caught up" : `${unreadCount} unread`}
          </p>
        </div>
        {recent.length > 0 ? (
          <div className="overflow-y-auto flex-1 min-h-0">
            {recent.map((item: any) => (
              <div
                key={`${item.kind}-${item.id}`}
                className="w-full flex items-start gap-1 px-4 py-3 border-b last:border-b-0 hover:bg-accent transition-colors"
              >
                <button className="min-w-0 flex-1 text-left" onClick={() => openItem(item)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate flex items-center gap-1.5">
                      {item.kind === "missed_call" && <Phone className="h-3 w-3 text-amber-600 shrink-0" />}
                      {item.clientName?.trim() || item.toNumber}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(item.at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {item.kind === "missed_call" ? `Missed call: "${item.body}"` : item.body}
                  </p>
                </button>
                {item.kind === "missed_call" && (
                  <button
                    className="shrink-0 h-5 w-5 mt-0.5 flex items-center justify-center rounded hover:bg-muted-foreground/20 text-muted-foreground"
                    title="Clear this notification"
                    onClick={() => clearMissedCall.mutate({ id: item.id })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6 shrink-0">No new notifications</p>
        )}
        <button
          className="w-full shrink-0 text-center text-xs font-medium text-primary py-2.5 border-t bg-background hover:bg-accent transition-colors"
          onClick={() => setLocation("/messages")}
        >
          View all messages
        </button>
      </PopoverContent>
    </Popover>
  );
}

