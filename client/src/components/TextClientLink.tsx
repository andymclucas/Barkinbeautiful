import { MessageSquare } from "lucide-react";
import { smsHref } from "@shared/phoneLinks";

/**
 * A small "text this number" button beside a client's phone number. It
 * opens the device's own Messages app (shared/phoneLinks.ts); Groomigo
 * sends nothing. Renders nothing when the number is unusable.
 */
export function TextClientLink({ phone, className = "" }: { phone: string | null | undefined; className?: string }) {
  const href = smsHref(phone);
  if (!href) return null;
  return (
    <a
      href={href}
      onClick={(e) => e.stopPropagation()}
      title="Text this number"
      aria-label={`Text ${phone}`}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary ${className}`}
    >
      <MessageSquare className="h-3.5 w-3.5" />
    </a>
  );
}
