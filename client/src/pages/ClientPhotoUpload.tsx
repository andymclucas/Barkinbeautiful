import { useRef, useState } from "react";
import { useRoute } from "wouter";
import { Camera, CheckCircle2, ImageUp, Loader2, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Where a client sends the salon a photo.
 *
 * Opened from a link in a text message, on a phone, by someone who has no
 * account and does not want one. So: no login, no navigation, no layout
 * chrome. One button that opens the camera roll, and a clear answer about
 * whether the picture arrived.
 *
 * `capture` is deliberately NOT set on the input. A client reporting a cut
 * is usually sending a photo they already took, and forcing the camera
 * open would hide their gallery.
 */
export default function ClientPhotoUpload() {
  const [, params] = useRoute("/photo/:token");
  const token = params?.token ?? "";
  const fileInput = useRef<HTMLInputElement>(null);

  const request = trpc.clientPhotos.getByToken.useQuery({ token }, { enabled: /^[0-9a-f]{32}$/.test(token), retry: false });
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function send(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) { setError("Please choose a photo."); return; }
    setSending(true);
    try {
      const response = await fetch(`/api/upload/client-photo?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: await file.arrayBuffer(),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error ?? "We could not save that photo. Please try again."); return; }
      setSentCount((n) => n + 1);
      // The query carries the remaining count, so a fresh one keeps the
      // "you can send another" line honest after each upload.
      request.refetch();
    } catch {
      setError("We could not reach the salon. Check your signal and try again.");
    } finally {
      setSending(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const shell = (children: React.ReactNode) => (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-950 via-slate-950 to-violet-950 px-5 py-10">
      <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-2xl sm:p-8">{children}</div>
    </main>
  );

  if (!/^[0-9a-f]{32}$/.test(token) || request.error) {
    return shell(
      <div className="text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-violet-600 dark:text-violet-400" />
        <h1 className="mt-3 text-lg font-bold">This photo link is not valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please ask the salon for a new one.</p>
      </div>,
    );
  }

  if (request.isLoading || !request.data) {
    return shell(<p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>);
  }

  if (!request.data.ok) {
    return shell(
      <div className="text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-violet-600 dark:text-violet-400" />
        <h1 className="mt-3 text-lg font-bold">Link no longer active</h1>
        <p className="mt-2 text-sm text-muted-foreground">{request.data.message}</p>
      </div>,
    );
  }

  const { firstName, petName, salonName, reason, remaining } = request.data;

  return shell(
    <>
      <div className="text-center">
        <div className="mx-auto w-fit rounded-2xl bg-violet-100 p-3 dark:bg-violet-950/60">
          <Camera className="h-7 w-7 text-violet-700 dark:text-violet-300" />
        </div>
        <h1 className="mt-4 text-xl font-bold">
          Hi {firstName}, send {salonName} a photo
        </h1>
        {reason ? (
          <p className="mt-2 text-sm text-muted-foreground">They asked for {reason}.</p>
        ) : petName ? (
          <p className="mt-2 text-sm text-muted-foreground">About {petName}.</p>
        ) : null}
      </div>

      {sentCount > 0 && (
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {sentCount === 1 ? "Photo sent." : `${sentCount} photos sent.`} The salon can see
            {sentCount === 1 ? " it" : " them"} now — you don't need to do anything else.
          </span>
        </div>
      )}

      {error && (
        <p className="mt-5 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">{error}</p>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (file) void send(file); }}
      />

      {remaining > 0 ? (
        <Button
          className="mt-6 h-12 w-full bg-violet-700 text-base hover:bg-violet-800"
          disabled={sending}
          onClick={() => fileInput.current?.click()}
        >
          {sending
            ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Sending…</>
            : <><ImageUp className="mr-2 h-5 w-5" />{sentCount > 0 ? "Send another photo" : "Choose a photo"}</>}
        </Button>
      ) : (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Thanks — that's all the photos this link can take. Call the salon if you need to send more.
        </p>
      )}

      {/* The sentence that is deliberately not in the text message: it
          costs 76 characters there, which doubles the cost of every photo
          request the salon sends. Here it is free, and the person reading
          it has already tapped the link. */}
      <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
        Photos texted straight back to the salon's number don't come through — that's why they sent this link.
      </p>
    </>,
  );
}
