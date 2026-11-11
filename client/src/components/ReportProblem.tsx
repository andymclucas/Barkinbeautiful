import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, MessageSquareWarning, Video, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { captureScreen, SCREENSHOT_IGNORE_ATTR } from "@/lib/captureScreen";
import { recentErrors } from "@/lib/recentErrors";
import {
  ISSUE_MAX_PHOTOS, ISSUE_MESSAGE_MAX, ISSUE_VIDEO_CHUNK_BYTES, ISSUE_VIDEO_MAX_BYTES,
  issueContextFromLocation, isIssueVideoType, videoChunkCount,
  type IssueRecentError, type IssueVideoType,
} from "@shared/issueReports";

/**
 * "Report a problem" (Andy, 11/11/2026), open to every staff login.
 *
 * The screen is photographed and the page's address and recent errors are
 * noted at the moment the button is pressed — before the dialog covers
 * anything, and before the person navigates away to describe it.
 */
type Snapshot = {
  path: string;
  search: string;
  title: string;
  errors: IssueRecentError[];
  viewport: string;
  userAgent: string;
};

async function uploadImage(blob: Blob): Promise<string> {
  const res = await fetch("/api/upload/issue-report-image", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg" },
    body: blob,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.key) throw new Error(body.error || "An image did not upload");
  return body.key as string;
}

/** The video's type, from the file or — when a phone leaves it blank — its name. */
function videoTypeOf(file: File): IssueVideoType | null {
  const t = file.type.toLowerCase();
  if (isIssueVideoType(t)) return t;
  const name = file.name.toLowerCase();
  if (name.endsWith(".mp4") || name.endsWith(".m4v")) return "video/mp4";
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".webm")) return "video/webm";
  return null;
}

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

/**
 * Send a video in ISSUE_VIDEO_CHUNK_BYTES pieces (server/issueVideo.ts).
 * A piece that fails on the network is retried twice; a refusal (4xx) is
 * not, because sending it again would be refused again.
 */
async function uploadVideo(file: File, type: IssueVideoType, onProgress: (done: number, total: number) => void): Promise<string> {
  const total = videoChunkCount(file.size);
  let key = "";
  for (let seq = 0; seq < total; seq++) {
    const piece = file.slice(seq * ISSUE_VIDEO_CHUNK_BYTES, Math.min(file.size, (seq + 1) * ISSUE_VIDEO_CHUNK_BYTES));
    const query = seq === 0 ? `seq=0&size=${file.size}` : `seq=${seq}&key=${encodeURIComponent(key)}`;
    for (let attempt = 1; ; attempt++) {
      let res: Response | null = null;
      try {
        res = await fetch(`/api/upload/issue-report-video?${query}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": seq === 0 ? type : "application/octet-stream" },
          body: piece,
        });
      } catch {
        res = null;
      }
      if (res?.ok) {
        const body = await res.json();
        if (seq === 0) key = body.key;
        break;
      }
      const refused = res !== null && res.status >= 400 && res.status < 500;
      if (refused || attempt >= 3) {
        const body = res ? await res.json().catch(() => ({})) : {};
        throw new Error(body.error || "The video didn't upload. Check the connection and try again.");
      }
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
    onProgress(seq + 1, total);
  }
  return key;
}

/** A preview URL that is released when the blob goes away. */
function useObjectUrl(blob: Blob | null) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

function PhotoThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = useObjectUrl(file);
  return (
    <div className="relative h-16 w-16 overflow-hidden rounded-md border bg-muted">
      {url && <img src={url} alt={file.name} className="h-full w-full object-cover" />}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
        aria-label={`Remove ${file.name}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function ReportProblemDialog({
  open, onOpenChange, screenshot, snapshot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screenshot: Blob | null;
  snapshot: Snapshot | null;
}) {
  const [message, setMessage] = useState("");
  const [includeShot, setIncludeShot] = useState(true);
  const [photos, setPhotos] = useState<File[]>([]);
  const [video, setVideo] = useState<{ file: File; type: IssueVideoType } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const shotUrl = useObjectUrl(screenshot);
  const submit = trpc.issueReports.submit.useMutation();

  // A fresh form each time it opens; nothing carried over from last time.
  useEffect(() => {
    if (open) { setMessage(""); setIncludeShot(true); setPhotos([]); setVideo(null); setProgress(null); setSending(false); }
  }, [open]);

  const addPhotos = (list: FileList | null) => {
    if (!list) return;
    const images = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setPhotos((current) => {
      const next = [...current, ...images].slice(0, ISSUE_MAX_PHOTOS);
      if (current.length + images.length > ISSUE_MAX_PHOTOS) toast.info(`Up to ${ISSUE_MAX_PHOTOS} photos.`);
      return next;
    });
  };

  const pickVideo = (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    const type = videoTypeOf(file);
    if (!type) { toast.error("Attach an MP4, MOV or WebM video."); return; }
    if (file.size > ISSUE_VIDEO_MAX_BYTES) {
      toast.error(`That video is ${mb(file.size)} — the limit is ${mb(ISSUE_VIDEO_MAX_BYTES)}. Trim it or record a shorter clip.`);
      return;
    }
    setVideo({ file, type });
  };

  const send = async () => {
    if (!snapshot || !message.trim() || sending) return;
    setSending(true);
    try {
      const images: Array<{ key: string; kind: "screenshot" | "photo" | "video" }> = [];
      if (includeShot && screenshot) { setProgress("Uploading screenshot…"); images.push({ key: await uploadImage(screenshot), kind: "screenshot" }); }
      for (const [i, photo] of photos.entries()) {
        setProgress(`Uploading photo ${i + 1} of ${photos.length}…`);
        images.push({ key: await uploadImage(photo), kind: "photo" });
      }
      if (video) {
        const key = await uploadVideo(video.file, video.type, (done, total) =>
          setProgress(`Uploading video… ${Math.round((done / total) * 100)}%`));
        images.push({ key, kind: "video" });
      }
      setProgress("Sending…");
      await submit.mutateAsync({
        message: message.trim(),
        pagePath: snapshot.path.slice(0, 512),
        pageTitle: snapshot.title.slice(0, 255) || undefined,
        context: {
          ...issueContextFromLocation(snapshot.path, snapshot.search),
          viewport: snapshot.viewport,
          userAgent: snapshot.userAgent.slice(0, 400),
        },
        recentErrors: snapshot.errors,
        images,
      });
      toast.success("Report sent — thank you. The owners will take a look.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The report did not send. Please try again.");
      setSending(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!sending) onOpenChange(next); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" {...{ [SCREENSHOT_IGNORE_ATTR]: "" }}>
        <DialogHeader>
          <DialogTitle>Report a problem</DialogTitle>
          <DialogDescription>
            Goes to the salon owners with the screen you were on, so you only need to say what happened.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="report-message" className="text-sm font-medium">What went wrong?</label>
            <Textarea
              id="report-message"
              autoFocus
              rows={4}
              maxLength={ISSUE_MESSAGE_MAX}
              placeholder="e.g. Pressed Send on Benny's pickup text and nothing happened"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Screenshot</p>
            {shotUrl ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={includeShot}
                  onChange={(e) => setIncludeShot(e.target.checked)}
                />
                <img src={shotUrl} alt="The screen you were on" className="max-h-40 w-auto max-w-[75%] rounded border object-contain" />
                <span className="text-xs text-muted-foreground">Include the screen you were on</span>
              </label>
            ) : (
              <p className="text-xs text-muted-foreground">
                This device couldn't take one — add a photo of the screen below if it helps.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Photos <span className="font-normal text-muted-foreground">(optional, up to {ISSUE_MAX_PHOTOS})</span></p>
            <div className="flex flex-wrap items-center gap-2">
              {photos.map((file, i) => (
                <PhotoThumb key={`${file.name}-${i}`} file={file} onRemove={() => setPhotos((p) => p.filter((_, j) => j !== i))} />
              ))}
              {photos.length < ISSUE_MAX_PHOTOS && (
                <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                  <ImagePlus className="mr-1.5 h-4 w-4" /> Add photos
                </Button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">
              Video <span className="font-normal text-muted-foreground">(optional, up to {mb(ISSUE_VIDEO_MAX_BYTES)} — a screen recording is ideal)</span>
            </p>
            {video ? (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{video.file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{mb(video.file.size)}</span>
                <button
                  type="button"
                  onClick={() => setVideo(null)}
                  disabled={sending}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                  aria-label="Remove the video"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => videoInput.current?.click()}>
                <Video className="mr-1.5 h-4 w-4" /> Add video
              </Button>
            )}
            <input
              ref={videoInput}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/*"
              className="hidden"
              onChange={(e) => { pickVideo(e.target.files); e.target.value = ""; }}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={sending || !message.trim()}>
            {sending ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> {progress ?? "Sending…"}</> : "Send report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The button's behaviour, for the header and the account menu to share:
 * photograph the screen, note where we are, then open the form.
 */
export function useReportProblem() {
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [screenshot, setScreenshot] = useState<Blob | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const start = async () => {
    if (capturing || open) return;
    setCapturing(true);
    setSnapshot({
      path: window.location.pathname,
      search: window.location.search,
      title: document.title,
      errors: recentErrors(),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      userAgent: navigator.userAgent,
    });
    // Let a menu that was just clicked finish closing before the picture.
    await new Promise((r) => setTimeout(r, 250));
    setScreenshot(await captureScreen());
    setCapturing(false);
    setOpen(true);
  };

  const dialog = (
    <ReportProblemDialog open={open} onOpenChange={setOpen} screenshot={screenshot} snapshot={snapshot} />
  );
  return { start, capturing, dialog };
}

/** The header icon. */
export function ReportProblemButton({ onClick, capturing }: { onClick: () => void; capturing: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={capturing}
      aria-label="Report a problem"
      title="Report a problem"
      className="hidden h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:flex"
    >
      {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareWarning className="h-4 w-4" />}
    </button>
  );
}
