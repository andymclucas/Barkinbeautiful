import { Bell } from "lucide-react";
import { useLocation } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  const { data } = trpc.sms.getUnreadPreview.useQuery(
    { limit: 6 },
    { refetchInterval: 20000, refetchOnWindowFocus: true }
  );

  const unreadCount = data?.unreadCount ?? 0;
  const recent = data?.recent ?? [];

  const openThread = (clientId: number | null, toNumber: string) => {
    const params = clientId ? `clientId=${clientId}` : `toNumber=${encodeURIComponent(toNumber)}`;
    setLocation(`/messages?${params}`);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative h-9 w-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/12 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
          aria-label={unreadCount > 0 ? `${unreadCount} unread messages` : "Notifications"}
        >
          <Bell className="h-4 w-4 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-semibold">Messages</h3>
          <p className="text-xs text-muted-foreground">
            {unreadCount === 0 ? "You're all caught up" : `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`}
          </p>
        </div>
        {recent.length > 0 ? (
          <ScrollArea className="max-h-80">
            {recent.map((msg: any) => (
              <button
                key={msg.id}
                className="w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-accent transition-colors"
                onClick={() => openThread(msg.clientId, msg.toNumber)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{msg.clientName?.trim() || msg.toNumber}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(msg.sentAt)}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{msg.body}</p>
              </button>
            ))}
          </ScrollArea>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">No new messages</p>
        )}
        <button
          className="w-full text-center text-xs font-medium text-primary py-2.5 border-t hover:bg-accent transition-colors"
          onClick={() => setLocation("/messages")}
        >
          View all messages
        </button>
      </PopoverContent>
    </Popover>
  );
}
