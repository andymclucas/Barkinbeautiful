import { Link } from "wouter";

/**
 * A client's name, and a dog's name, as links to their record.
 *
 * Andy, 28/10/2026: "Make all client names clickable across the whole
 * platform regardless of the screen they're on. Same with dogs."
 *
 * Two components rather than fifty inline `<Link>`s, because the thing
 * that makes this worth doing is that it behaves the SAME everywhere —
 * one destination rule, one hover, one answer to "what if there is no
 * id". A board that links some names and not others is worse than one
 * that links none, because staff stop trying.
 *
 * ## Styling
 *
 * Deliberately not blue-and-underlined. These names sit in dense boards
 * and tables — the workflow board draws forty at once — and colouring
 * every one would turn the salon's day into a wall of links. The name
 * keeps whatever colour and weight it already had and only announces
 * itself on hover, which is the convention the client list already uses.
 *
 * ## No id, no link
 *
 * Both fall back to plain text when the id is missing. An imported row
 * with no client, a deleted pet, an aggregate row that names a dog it
 * cannot identify — all of those still render their name. Nothing here
 * may make a name disappear because it could not be linked.
 */

const LINK_CLASS =
  "rounded-sm underline-offset-2 transition-colors hover:text-primary hover:underline "
  + "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

/** Stops a click on the name from also triggering the row behind it. */
function swallowRowClick(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

export function ClientLink({
  clientId,
  children,
  className = "",
  title,
}: {
  clientId: number | null | undefined;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  if (!clientId) return <span className={className}>{children}</span>;
  return (
    <Link
      href={`/clients/${clientId}`}
      className={`${LINK_CLASS} ${className}`}
      title={title ?? "Open this client's record"}
      onClick={swallowRowClick}
    >
      {children}
    </Link>
  );
}

/**
 * A dog links to its OWNER's record, because there is no page for a pet
 * — `/clients/:id` is the only route that holds one. `?pet=` tells that
 * page to open on Pets with this dog expanded, so clicking a dog lands
 * on the dog rather than on the top of a stranger's record.
 */
export function PetLink({
  clientId,
  petId,
  children,
  className = "",
  title,
}: {
  clientId: number | null | undefined;
  petId: number | null | undefined;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  if (!clientId) return <span className={className}>{children}</span>;
  const href = petId ? `/clients/${clientId}?pet=${petId}` : `/clients/${clientId}`;
  return (
    <Link
      href={href}
      className={`${LINK_CLASS} ${className}`}
      title={title ?? "Open this dog's record"}
      onClick={swallowRowClick}
    >
      {children}
    </Link>
  );
}

/**
 * Where a dog's name should point. Exported for the places that already
 * build their own anchor and only need the destination.
 */
export function petRecordHref(clientId: number | null | undefined, petId: number | null | undefined): string | null {
  if (!clientId) return null;
  return petId ? `/clients/${clientId}?pet=${petId}` : `/clients/${clientId}`;
}

export function clientRecordHref(clientId: number | null | undefined): string | null {
  return clientId ? `/clients/${clientId}` : null;
}
