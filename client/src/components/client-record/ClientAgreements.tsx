import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, FileText } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useTimezone } from "@/lib/timezone";

const REQUIREMENT_LABEL: Record<string, string> = {
  sign_once: "Sign once",
  every_booking: "Sign on every booking",
  manual: "Sent by hand",
};

/**
 * Which agreements this client has signed, and recording one at the
 * counter.
 *
 * "Signed an older version" is shown as its own state rather than folded
 * into signed or unsigned: they did agree to something, just not to the
 * wording in force now, and that is exactly the case the salon needs to
 * see before a dispute.
 */
export function ClientAgreementsPanel({ clientId, clientName }: { clientId: number; clientName: string }) {
  const tz = useTimezone();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.agreements.forClient.useQuery({ tenantId: 1, clientId });
  const [reading, setReading] = useState<{ title: string; body: string } | null>(null);
  const [signing, setSigning] = useState<{ id: number; title: string } | null>(null);
  const [signedName, setSignedName] = useState("");

  const importFromMoeGo = trpc.agreements.importFromMoeGo.useMutation({
    onSuccess: (r) => {
      toast.success(r.added.length ? `Imported ${r.added.length} agreements` : "Nothing new to import");
      utils.agreements.forClient.invalidate({ tenantId: 1, clientId });
      utils.agreements.list.invalidate({ tenantId: 1 });
    },
    onError: (e) => toast.error(e.message),
  });

  const record = trpc.agreements.recordSignature.useMutation({
    onSuccess: () => {
      toast.success("Signature recorded");
      setSigning(null);
      setSignedName("");
      utils.agreements.forClient.invalidate({ tenantId: 1, clientId });
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading agreements…</CardContent></Card>;

  if (!data?.length) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Agreements</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            No agreements are set up yet. The six written in MoeGo — the five VIP tiers and the service
            agreement — can be brought across as they are.
          </p>
          <Button size="sm" disabled={importFromMoeGo.isPending} onClick={() => importFromMoeGo.mutate({ tenantId: 1 })}>
            {importFromMoeGo.isPending ? "Importing…" : "Import the MoeGo agreements"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Nothing is sent to anyone, and running it twice is harmless — it skips any that already exist.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Agreements</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data.map(doc => (
            <div key={doc.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{doc.title}</p>
                <p className="text-xs text-muted-foreground">
                  v{doc.version} · {REQUIREMENT_LABEL[doc.requirement] ?? doc.requirement}
                </p>
              </div>

              {doc.signedAt ? (
                <Badge variant="secondary" className="gap-1 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" /> Signed {tz.date(doc.signedAt)}
                </Badge>
              ) : doc.signedOlderVersion ? (
                <Badge variant="secondary" className="gap-1 text-amber-700 dark:text-amber-300">
                  <CircleAlert className="h-3 w-3" /> Signed v{doc.signedOlderVersion}, terms have changed
                </Badge>
              ) : (
                <Badge variant="outline">Not signed</Badge>
              )}

              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" onClick={() => setReading({ title: doc.title, body: doc.body })}>
                  Read
                </Button>
                {!doc.signedAt && (
                  <Button size="sm" onClick={() => { setSigning({ id: doc.id, title: doc.title }); setSignedName(clientName); }}>
                    Record signature
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!reading} onOpenChange={(open) => !open && setReading(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{reading?.title}</DialogTitle></DialogHeader>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{reading?.body}</p>
        </DialogContent>
      </Dialog>

      <Dialog open={!!signing} onOpenChange={(open) => !open && setSigning(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record signature</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {signing?.title} — recorded against the wording in force now, with your name against it as the
              staff member who took it.
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="signed-name">Name the client gave</Label>
              <Input id="signed-name" value={signedName} onChange={(e) => setSignedName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSigning(null)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!signedName.trim() || record.isPending}
              onClick={() => signing && record.mutate({ tenantId: 1, clientId, documentId: signing.id, signedName: signedName.trim() })}
            >
              {record.isPending ? "Recording…" : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
