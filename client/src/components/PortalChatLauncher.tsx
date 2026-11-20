import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BruceAvatar } from "@/components/BruceAvatar";

/**
 * The button that opens the client portal's chat with the salon.
 *
 * It used to be Bruce's face alone, a 56px circle in the corner with no
 * words. Lauren, 20/11/2026, passing on what a client said once they had set
 * the portal up: it is "not clear for old people on where to send messages
 * through the portal to us.. if it can be bigger and stand out". A picture of
 * a dog does not say "message us"; the words do. More clients finding it
 * means fewer of them texting the salon's phone instead.
 *
 * So while the chat is closed it reads "Message us" beside Bruce, in large
 * type, as a pill. Open, it shrinks back to a close button so it does not sit
 * over the conversation it opened.
 *
 * Plain props, no tRPC, so it can be rendered in a test.
 */
export function PortalChatLauncher({
  open,
  unread,
  onToggle,
}: {
  open: boolean;
  unread: number;
  onToggle: () => void;
}) {
  if (open) {
    return (
      <Button
        onClick={onToggle}
        aria-label="Close chat"
        className="fixed bottom-6 right-4 z-50 h-14 w-14 rounded-full p-0 shadow-xl sm:right-6"
      >
        <X className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Button
      onClick={onToggle}
      aria-label={unread > 0 ? `Message us, ${unread} unread` : "Message us"}
      className="fixed bottom-6 right-4 z-50 h-16 gap-3 rounded-full py-2 pl-2 pr-6 text-lg font-bold shadow-xl ring-4 ring-primary/25 sm:right-6"
    >
      <BruceAvatar size={48} className="rounded-full" />
      <span aria-hidden="true">Message us</span>
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-bold text-destructive-foreground"
        >
          {unread}
        </span>
      )}
    </Button>
  );
}
