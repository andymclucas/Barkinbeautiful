import { useState } from "react";
import { Archive, ArchiveRestore, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The dogs archived off this client's file, folded away under the pet cards.
 *
 * Archived (shared/petArchive.ts) means a dog that no longer comes, or a
 * duplicate record. It is hidden from booking and lists, but it must not
 * VANISH from the client page: staff look for the dog they remember, and
 * a gap reads as data loss. So it sits here, closed by default, with
 * Restore for whoever is allowed to archive.
 *
 * Plain props, no tRPC, so it can be rendered in a test.
 */
export type ArchivedPet = { id: number; name: string; breed?: string | null; archivedAt?: Date | string | null };

export function ArchivedPetsSection({
  pets,
  canRestore,
  restoringId,
  onRestore,
}: {
  pets: readonly ArchivedPet[];
  canRestore: boolean;
  restoringId?: number | null;
  onRestore: (pet: ArchivedPet) => void;
}) {
  const [open, setOpen] = useState(false);
  if (pets.length === 0) return null;

  return (
    <div className="rounded-xl border border-dashed bg-muted/30">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-muted-foreground hover:text-foreground"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Archive className="h-4 w-4" />
        Archived dogs ({pets.length})
      </button>
      {open && (
        <ul className="divide-y border-t">
          {pets.map((pet) => (
            <li key={pet.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{pet.name}</span>
                {pet.breed && <span className="text-muted-foreground"> · {pet.breed}</span>}
              </span>
              {canRestore && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5"
                  disabled={restoringId === pet.id}
                  onClick={() => onRestore(pet)}
                >
                  <ArchiveRestore className="h-3.5 w-3.5" />
                  {restoringId === pet.id ? "Restoring…" : "Restore"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
