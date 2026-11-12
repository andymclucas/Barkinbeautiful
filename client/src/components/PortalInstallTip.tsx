import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "Save this to your phone", once, on the two phones that matter
 * (Andy, 12/11/2026). Clients kept losing the way back to the portal; an
 * icon on their Home Screen is the way back that needs nothing remembered.
 *
 * Deliberately only two cases, because "every phone and browser" is a
 * nightmare nobody can maintain:
 * - iPhone/iPad in Safari: Share, then Add to Home Screen. (Another
 *   browser on iOS cannot add a web app, so it says to open Safari.)
 * - Android: Chrome's own install prompt, triggered from the button.
 * Anything else — a desktop, an unknown phone — gets nothing rather than
 * instructions that may be wrong. Hidden once the portal is already
 * running from the Home Screen, and for good once dismissed.
 */
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISSED_KEY = "portal-install-tip-dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches
    || Boolean((navigator as unknown as { standalone?: boolean }).standalone);
}

export function phoneKind(userAgent: string): "ios-safari" | "ios-other" | "android" | null {
  const ua = userAgent || "";
  const ios = /iPhone|iPad|iPod/i.test(ua);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) ? "ios-other" : "ios-safari";
  if (/Android/i.test(ua)) return "android";
  return null;
}

export function PortalInstallTip() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISSED_KEY) === "1"; } catch { return false; }
  });
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const kind = typeof navigator === "undefined" ? null : phoneKind(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); };
    const onInstalled = () => dismiss();
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* storage may be blocked */ }
  }

  if (dismissed || isStandalone() || !kind) return null;
  // Android without Chrome's prompt (another browser, or already offered) gets nothing.
  if (kind === "android" && !prompt) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
      <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-semibold">Save this portal to your phone</p>
        {kind === "ios-safari" && (
          <p className="text-muted-foreground">
            Tap the <strong>Share</strong> button (the square with an arrow) at the bottom of Safari, then <strong>Add to Home Screen</strong>. Next time, just tap the icon.
          </p>
        )}
        {kind === "ios-other" && (
          <p className="text-muted-foreground">
            Open this page in <strong>Safari</strong>, then tap Share and <strong>Add to Home Screen</strong>. Other browsers on iPhone can&rsquo;t add it.
          </p>
        )}
        {kind === "android" && prompt && (
          <Button size="sm" onClick={async () => { await prompt.prompt(); await prompt.userChoice.catch(() => null); dismiss(); }}>
            Add to Home Screen
          </Button>
        )}
      </div>
      <button type="button" aria-label="Don't show this again" className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={dismiss}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
