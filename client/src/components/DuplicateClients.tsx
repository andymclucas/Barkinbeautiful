import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Merge, Users } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/**
 * Two records that are one customer, and the button that joins them.
 *
 * Andy, 05/11/2026, asked for this because he has been doing it by
 * hand. Run over the real book the same day: 10,113 clients, five
 * genuine duplicates — and five HOUSEHOLDS sharing a phone or an email
 * that are not duplicates at all.
 *
 * Those households are shown, not hidden, and never offered a one-press
 * merge. Rob and Carla Newman share an email because they live
 * together; folding them together would lose a customer.
 */

type Group = {
  reason: "phone" | "email" | "name";
  confidence: "likely" | "possible";
  key: string;
  suggestedSurvivorId: number | null;
  clients: {
    id: number; firstName: string | null; lastName: string | null;
    email: string | null; phone: string | null;
    pets?: number; appointments?: number; invoices?: number; hasPortal?: boolean;
  }[];
};

const nameOf = (c: Group["clients"][number]) =>
  `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || `Client ${c.id}`;

export function DuplicateClients({ onMerged }: { onMerged?: () => void }) {
  const { data, isLoading, refetch } = trpc.clients.findDuplicates.useQuery({});
  const [confirming, setConfirming] = useState<{ group: Group; survivorId: number; loserId: number } | null>(null);

  const groups = (data ?? []) as Group[];
  const likely = groups.filter((g) => g.confidence === "likely");
  const households = groups.filter((g) => g.confidence === "possible" && g.reason !== "name");
  const sameName = groups.filter((g) => g.confidence === "possible" && g.reason === "name");

  if (isLoading) return <p className="text-sm text-muted-foreground">Looking for duplicates…</p>;

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Merge className="h-4 w-4 text-primary" />
          Same person, entered twice
          <Badge variant="outline">{likely.length}</Badge>
        </h3>
        {likely.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing to merge — the book is clean.</p>
        )}
        {likely.map((group) => (
          <GroupRow
            key={group.key}
            group={group}
            onMerge={(survivorId, loserId) => setConfirming({ group, survivorId, loserId })}
          />
        ))}
      </section>

      {households.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            One household, two people
            <Badge variant="outline">{households.length}</Badge>
          </h3>
          <p className="text-xs text-muted-foreground">
            These share a phone or an email but have different names, so they are almost
            certainly a couple rather than one person twice. Shown so you can look; no merge
            offered.
          </p>
          {households.map((group) => (
            <div key={group.key} className="rounded-lg border border-amber-300/50 bg-amber-50/40 p-2.5 text-sm dark:border-amber-900/40 dark:bg-amber-950/20">
              {group.clients.map((c) => nameOf(c)).join("  ·  ")}
              <span className="ml-2 text-xs text-muted-foreground">shared {group.reason}</span>
            </div>
          ))}
        </section>
      )}

      {sameName.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-sm font-semibold">
            Same name only{" "}
            <Badge variant="outline">{sameName.length}</Badge>
          </h3>
          <p className="text-xs text-muted-foreground">
            A shared name is not evidence — the salon has real customers who share one. These
            are listed for you to judge, and nothing here is offered a merge either.
          </p>
        </section>
      )}

      <MergeDialog
        confirming={confirming}
        onClose={() => setConfirming(null)}
        onDone={() => { setConfirming(null); refetch(); onMerged?.(); }}
      />
    </div>
  );
}

function GroupRow({
  group, onMerge,
}: { group: Group; onMerge: (survivorId: number, loserId: number) => void }) {
  const survivorId = group.suggestedSurvivorId ?? group.clients[0]?.id;
  return (
    <div className="rounded-lg border p-2.5">
      <p className="mb-2 text-xs text-muted-foreground">Matched on {group.reason}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {group.clients.map((c) => {
          const keeping = c.id === survivorId;
          return (
            <div
              key={c.id}
              className={`rounded-md border p-2 text-sm ${keeping ? "border-primary/40 bg-primary/5" : ""}`}
            >
              <p className="font-medium">
                {nameOf(c)}
                {keeping && <span className="ml-2 text-xs font-semibold text-primary">keeping</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.pets ?? 0} dogs · {c.appointments ?? 0} bookings · {c.invoices ?? 0} invoices
                {c.hasPortal ? " · portal login" : ""}
              </p>
              {/* The counts are the whole argument for which to keep, so
                  they sit on the card rather than in a tooltip. */}
              {!keeping && (
                <Button
                  size="sm" variant="outline" className="mt-2 h-7"
                  onClick={() => onMerge(survivorId, c.id)}
                >
                  Merge into {nameOf(group.clients.find((x) => x.id === survivorId)!)}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MergeDialog({
  confirming, onClose, onDone,
}: {
  confirming: { group: Group; survivorId: number; loserId: number } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const preview = trpc.clients.mergePreview.useQuery(
    { loserId: confirming?.loserId ?? 0 },
    { enabled: confirming !== null },
  );
  const merge = trpc.clients.mergeInto.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.mergedName || "That record"} merged — ${r.total} rows moved`);
      utils.clients.invalidate();
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!confirming) return null;
  const loser = confirming.group.clients.find((c) => c.id === confirming.loserId);
  const survivor = confirming.group.clients.find((c) => c.id === confirming.survivorId);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge these two records?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            Everything on <strong>{loser ? nameOf(loser) : "that record"}</strong> moves to{" "}
            <strong>{survivor ? nameOf(survivor) : "the other"}</strong>, and the empty record is
            deleted.
          </p>
          {/* Said plainly, because it is true and a person about to do it
              should read it before pressing, not discover it after. */}
          <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            This cannot be undone from here. If it is wrong, it has to be put back by hand.
          </p>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">What will move</p>
            {preview.isLoading && <p className="text-xs text-muted-foreground">Counting…</p>}
            {preview.data && preview.data.length === 0 && (
              <p className="text-xs text-muted-foreground">Nothing — that record is empty.</p>
            )}
            <ul className="space-y-0.5">
              {(preview.data ?? []).map((row) => (
                <li key={row.table} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{row.table.replace(/_/g, " ")}</span>
                  <span className="tabular-nums font-medium">{row.rows}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={merge.isPending || preview.isLoading}
            onClick={() => merge.mutate({ survivorId: confirming.survivorId, loserId: confirming.loserId })}
          >
            {merge.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Merge and delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
