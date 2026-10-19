import { Link } from "wouter";
import { User, Phone, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ClientPetList, type ClientListPet } from "@/components/ClientPetList";
import { clientSince } from "@shared/clientSince";

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
