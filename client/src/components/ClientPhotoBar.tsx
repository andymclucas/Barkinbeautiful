import { useState } from "react";
import { Camera, Copy, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

/**
 * Asking this client for a photo, and seeing what they sent.
 *
 * Sits with the message composer because that is where the conversation
 * actually happens — a client saying "my dog came back cut" is in the
 * thread, and the answer to it should not be on another screen.
 *
 * A photo cannot be texted to the salon: the inbound webhook reads only
 * the message body, and Twilio's own documentation disagrees about
 * whether Australian numbers can receive MMS. So the salon sends a link.
 */
/**
 * The photos this client has already sent, as a strip above the composer.
 *
 * Separate from the button because they sit in different places: the
 * strip spans the width above the message box, the button lives in the
 * row beside it. Renders nothing at all when there are none, so a
 * conversation that has never involved a photo is unchanged.
 */
export function ClientPhotoStrip({ clientId }: { clientId: number | null }) {
  const enabled = typeof clientId === "number";
  const photos = trpc.clientPhotos.listForClient.useQuery({ clientId: clientId! }, { enabled });
  if (!enabled || !photos.data?.length) return null;

  return (
    <div className="mb-2 flex items-center gap-2 overflow-x-auto px-1 pb-1">
      <span className="shrink-0 text-xs text-muted-foreground">
        {photos.data.length} {photos.data.length === 1 ? "photo" : "photos"} sent in:
      </span>
      {photos.data.map((photo: any) => (
        <a
          key={photo.id}
          href={photo.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-lg border p-0.5 transition hover:ring-2 hover:ring-violet-500"
          title={`${photo.petName ? photo.petName + " \u00b7 " : ""}${new Date(photo.createdAt).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" })}`}
        >
          <img src={photo.url} alt="Photo sent by the client" className="h-14 w-14 rounded-md object-cover" />
        </a>
      ))}
    </div>
  );
}

export function AskForPhotoButton({ clientId, clientName }: { clientId: number | null; clientName?: string | null }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [lastLink, setLastLink] = useState<string | null>(null);

  const enabled = typeof clientId === "number";
  const utils = trpc.useUtils();

  const request = trpc.clientPhotos.request.useMutation({
    onSuccess: (result) => {
      setLastLink(result.url);
      if (result.smsSent) {
        toast.success(`Photo link texted to ${clientName?.trim() || "the client"}`);
        setAsking(false);
        setReason("");
      } else {
        // The link is real whether or not Twilio took the message, so it
        // stays on screen to be read out rather than silently lost.
        toast.error(`The text did not send${result.smsError ? `: ${result.smsError}` : ""}. Copy the link below instead.`);
      }
      utils.clientPhotos.listOpenRequests.invalidate();
      utils.clientPhotos.listForClient.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-violet-600 dark:hover:text-violet-400"
        // An unknown number has no record to file a photo against. The
        // button goes quiet rather than failing after the click.
        disabled={!enabled}
        title={enabled ? "Ask for a photo" : "Save this number as a client first"}
        aria-label="Ask for a photo"
        onClick={() => { setLastLink(null); setAsking(true); }}
      >
        <Camera className="h-4 w-4" />
      </Button>

      <Dialog open={asking} onOpenChange={(open) => { setAsking(open); if (!open) setLastLink(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask {clientName?.trim() || "this client"} for a photo</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              They'll get a text with a link. Tapping it lets them send a photo straight onto their
              record — no app and no login. The link lasts a week.
            </p>
            <div>
              <Label>What are you asking for? <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                className="mt-1.5"
                value={reason}
                maxLength={255}
                placeholder="a photo of Harvey's cut"
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Shown to them on the page, so they know it's really from you.
              </p>
            </div>

            {lastLink && (
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-xs font-medium">The link</p>
                <p className="mt-1 break-all font-mono text-xs">{lastLink}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    navigator.clipboard?.writeText(lastLink);
                    toast.success("Link copied");
                  }}
                >
                  <Copy className="mr-2 h-3.5 w-3.5" />Copy
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAsking(false)}>Close</Button>
            <Button
              disabled={!enabled || request.isPending}
              onClick={() => request.mutate({ clientId: clientId!, reason: reason.trim() || undefined })}
            >
              {request.isPending
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</>
                : lastLink ? "Send another link" : "Send the link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
