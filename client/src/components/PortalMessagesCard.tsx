import { MessageCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Messages, near the top of the portal where a client looks first.
 *
 * Andy, 24/11/2026: "Make the message section in client portal easier to
 * find." The chat was only the round "Message us" button in the bottom
 * corner, which clients took for decoration or never scrolled far enough to
 * notice (Lauren, 20/11/2026: "its not clear for old people on where to send
 * messages through the portal to us"). This card says plainly what it is
 * for, shows when the salon has replied, and opens the same chat.
 *
 * It reads the same getChat query as the chat itself, so it costs no extra
 * request.
 */
export function PortalMessagesCard({
  token,
  readOnly,
  onOpen,
}: {
  token?: string;
  readOnly?: boolean;
  onOpen: () => void;
}) {
  const chat = trpc.clientPortal.getChat.useQuery({ token }, { enabled: !readOnly, refetchInterval: 60000 });
  const unread = chat.data?.unread ?? 0;

  return (
    <Card className="border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/40">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-violet-600 text-white">
            <MessageCircle className="h-6 w-6" aria-hidden="true" />
            {unread > 0 && (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-bold text-destructive-foreground"
              >
                {unread}
              </span>
            )}
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Messages</h2>
            <p className="text-sm text-muted-foreground">
              {unread > 0
                ? `You have ${unread === 1 ? "a new reply" : `${unread} new replies`} from us.`
                : "Questions about a booking, your dog or your account? Send us a message here."}
            </p>
          </div>
        </div>
        <Button
          size="lg"
          className="bg-violet-600 text-base font-bold text-white hover:bg-violet-700"
          onClick={onOpen}
          disabled={readOnly}
        >
          {unread > 0 ? "Read your messages" : "Message us"}
        </Button>
      </CardContent>
    </Card>
  );
}
