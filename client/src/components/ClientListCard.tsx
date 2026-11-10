import { Link } from "wouter";
import { User, Phone, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ClientPetList, type ClientListPet } from "@/components/ClientPetList";
import { clientSince } from "@shared/clientSince";
import { describeCard, describePortal, hasCardOnFile } from "@shared/clientListFacts";

/**
 * One client, on a phone.
 *
 * The list is a seven-column table, and a table cannot be seven columns
 * wide at 375px — so every column past the name was hidden and a phone
 * showed "Aaron" and "Harch" against half a screen of white space. The
 * dogs, the number to ring and when they were last in are the whole
 * reason anyone opens this list on a phone.
 *
 * A card instead of a squeezed table. Same data, stacked, and the
 * information that identifies a client — their dogs — sits directly
 * under the name rather than four hidden columns away.
 */

export type ClientListCardData = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  phone?: string | null;
  email?: string | null;
  status: string;
  pets: ClientListPet[];
  bookings: number;
  firstVisit?: Date | string | null;
  lastVisit?: Date | string | null;
  nextVisit?: Date | string | null;
  /* The three facts added to the table on 10/11/2026. Andy, the same
     day: "Make the columns visible on mobile too." A phone gets a card
     rather than the table, so they had to be put here by hand — the
     table's own columns are invisible below sm, and widening them would
     have been a seven-column table at 375px, which is what this card
     exists to avoid. */
  portalAccountStatus?: string | null;
  stripeDefaultPaymentMethodId?: string | null;
  stripeCardBrand?: string | null;
  stripeCardLast4?: string | null;
  membership?: { label: string; extra: number } | null;
};

export function ClientListCard({
  client,
  statusClass,
  formatDate,
}: {
  client: ClientListCardData;
  statusClass: string;
  /** Passed in so the card does not reach for the timezone itself. */
  formatDate: (value: Date | string) => string;
}) {
  const name = `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "Unnamed client";
  const since = clientSince(client.firstVisit);

  return (
    <Link href={`/clients/${client.id}`}>
      <div className="flex min-w-0 cursor-pointer items-start gap-3 p-3 transition-colors active:bg-muted/50">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <User className="h-4 w-4 text-primary" />
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <p className="min-w-0 truncate font-medium">{name}</p>
            <Badge className={`shrink-0 text-[10px] ${statusClass}`}>{client.status}</Badge>
          </div>

          {/* The dogs come first: on a phone they are how you tell one
              Aaron from the next. */}
          <ClientPetList pets={client.pets} limit={2} />

          {(client.phone || client.email) && (
            <div className="min-w-0 space-y-0.5">
              {client.phone && (
                <p className="flex min-w-0 items-center gap-1 text-xs">
                  <Phone className="h-3 w-3 shrink-0" />
                  <span className="truncate">{client.phone}</span>
                </p>
              )}
              {client.email && (
                <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{client.email}</span>
                </p>
              )}
            </div>
          )}

          {/* Portal, card and membership, as chips.
              Three more lines of label-and-value would push the dogs and
              the phone number off a phone screen, and those are what the
              list is opened for. A chip says the same thing in the width
              of its own word, and only the two that are worth acting on
              carry a colour: a membership, and a card that is missing. */}
          <div className="flex flex-wrap items-center gap-1">
            {(() => {
              const portal = describePortal(client.portalAccountStatus);
              return (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  portal === "Yes" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : portal === "Invited" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                  : "bg-muted text-muted-foreground"}`}>
                  Portal {portal.toLowerCase()}
                </span>
              );
            })()}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              hasCardOnFile(client)
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                : "bg-muted text-muted-foreground"}`}>
              {hasCardOnFile(client) ? describeCard(client) : "No card"}
            </span>
            {client.membership && (
              <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
                {client.membership.label}
                {client.membership.extra > 0 ? ` +${client.membership.extra}` : ""}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">
              {client.bookings} {client.bookings === 1 ? "booking" : "bookings"}
            </span>
            {client.lastVisit && <span>Last {formatDate(client.lastVisit)}</span>}
            {client.nextVisit && (
              <span className="font-medium text-primary">Next {formatDate(client.nextVisit)}</span>
            )}
            {since.known && <span>Since {formatDate(since.at)}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}
