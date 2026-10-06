import { AlertTriangle, Dog, ShieldAlert, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type AsidePet = {
  id: number;
  name: string;
  breed?: string | null;
  weightKg?: string | number | null;
  weight?: string | null;
  status?: string | null;
  alertLevel?: string | null;
  behaviourNotes?: string | null;
  groomingNotes?: string | null;
};

/**
 * The dogs, beside the figures rather than a click away.
 *
 * Whoever opens a client is usually about to talk to them, and the three
 * things that change what you say are which dog, whether it bites, and
 * whether its paperwork has run out. Those sit together here; the full
 * pet records are still a section of their own.
 */
export function ClientPetsAside({ clientId, pets }: { clientId: number; pets: AsidePet[] }) {
  const { data: paperwork } = trpc.petPaperwork.forClient.useQuery({ clientId });

  const active = pets.filter(pet => pet.status !== "departed");
  if (active.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Pets</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">No pets on this client.</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Pets</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {active.map(pet => {
          const records = paperwork?.find(entry => entry.petId === pet.id)?.records ?? [];
          const expired = records.filter(record => record.expired);
          const weight = pet.weightKg ?? pet.weight;
          const notes = [pet.behaviourNotes, pet.groomingNotes].filter(Boolean) as string[];

          return (
            <div key={pet.id} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
              <div className="flex items-start gap-2">
                <Dog className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{pet.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[pet.breed, weight ? `${weight} kg` : null].filter(Boolean).join(" · ") || "No details recorded"}
                  </p>
                </div>
                {/* The enum is ok | caution | danger, and all but two of
                    the salon's pets are "ok" — so badging anything that
                    was not "none" (a value that does not exist) put a red
                    warning reading "ok" on every dog in the business.
                    Only the two that mean something get a badge. */}
                {(pet.alertLevel === "caution" || pet.alertLevel === "danger") && (
                  <Badge
                    variant={pet.alertLevel === "danger" ? "destructive" : "secondary"}
                    className={`shrink-0 gap-1 capitalize ${
                      pet.alertLevel === "caution"
                        ? "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-200"
                        : ""
                    }`}
                  >
                    <AlertTriangle className="h-3 w-3" /> {pet.alertLevel}
                  </Badge>
                )}
              </div>

              {/* Paperwork is the thing that stops a groom on the day, so
                  it is stated outright rather than left to be looked up. */}
              <div className="flex flex-wrap gap-1.5">
                {records.length === 0 ? (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <ShieldAlert className="h-3 w-3" /> Nothing on file
                  </Badge>
                ) : expired.length > 0 ? (
                  expired.map(record => (
                    <Badge key={record.id} variant="destructive" className="gap-1 text-xs">
                      <ShieldAlert className="h-3 w-3" /> {record.kind} expired {record.expiresOn}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="secondary" className="gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                    <ShieldCheck className="h-3 w-3" /> Paperwork current
                  </Badge>
                )}
              </div>

              {notes.map((note, idx) => (
                <p key={idx} className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs leading-snug">{note}</p>
              ))}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
