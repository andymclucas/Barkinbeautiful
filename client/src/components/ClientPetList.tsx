import { AngelWings } from "@/components/AngelWings";

/**
 * The dogs in one row of the client list.
 *
 * Its own component for two reasons. It is the only place in the list
 * with a rule in it — a dog that has passed away is shown struck
 * through with wings rather than dropped — and a rule that renders is
 * a rule that needs a rendering test (CLAUDE.md §7). And the list is
 * not the only screen that wants "this family's dogs, briefly".
 */

export type ClientListPet = {
  id: number;
  name: string | null;
  breed?: string | null;
  passedAway?: boolean;
};

/**
 * How many dogs fit in a list row before it stops being scannable.
 * One client has 27 — a breeder, not a household — so this is a real
 * cap and not a tidy-up: without it that single row would be nine
 * times the height of every other one.
 */
export const PETS_SHOWN_IN_LIST = 3;

export function ClientPetList({
  pets,
  limit = PETS_SHOWN_IN_LIST,
}: {
  pets: ClientListPet[];
  limit?: number;
}) {
  if (pets.length === 0) {
    return <span className="text-xs text-muted-foreground">No dogs</span>;
  }
  const hidden = pets.length - limit;
  return (
    <div className="min-w-0 space-y-0.5">
      {pets.slice(0, limit).map((pet) => (
        <p key={pet.id} className="flex min-w-0 items-center gap-1 text-xs">
          <span
            className={
              pet.passedAway
                ? "shrink-0 text-muted-foreground line-through"
                : "shrink-0 font-medium"
            }
          >
            {pet.name}
          </span>
          {pet.passedAway && (
            <AngelWings className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          {pet.breed && (
            <span className="truncate text-muted-foreground">{pet.breed}</span>
          )}
        </p>
      ))}
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">+{hidden} more</p>
      )}
    </div>
  );
}
