import { useEffect, useState } from "react";
import { MessageSquare, Lock, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isUsableSenderNumber } from "@shared/senderNumber";

/**
 * The number this salon's texts send from.
 *
 * It exists because nothing could write tenants.twilio_number — the column
 * was only ever read. Somebody set it by hand to the placeholder "+61...",
 * and on 06/10/2026 every outbound message failed for a day and a half with
 * "Invalid From Number (caller ID)". A field with validation in front of it
 * is how that stops being possible.
 *
 * Owner-only, and the server decides who that is. The card renders nothing
 * for anybody else rather than showing a control that will refuse them.
 */
export function SalonSmsNumber() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.settings.getSmsNumber.useQuery({}, { retry: false });
  const [draft, setDraft] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (data && !touched) setDraft(data.number ?? "");
  }, [data, touched]);

  const save = trpc.settings.setSmsNumber.useMutation({
    onSuccess: (result) => {
      toast.success(result.number ? "SMS number saved" : "Using the shared number again");
      utils.settings.getSmsNumber.invalidate();
      setTouched(false);
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading || !data?.canEdit) return null;

  const trimmed = draft.trim();
  const looksWrong = trimmed !== "" && !isUsableSenderNumber(trimmed);
  const unchanged = trimmed === (data.number ?? "");

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-5 w-5 text-primary" /> Text message sender
          <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
            <Lock className="h-3 w-3" /> Owner only
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        <div className="space-y-1.5">
          <Label htmlFor="salon-sms-number">Your Twilio number</Label>
          <Input
            id="salon-sms-number"
            inputMode="tel"
            placeholder="+61412345678"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setTouched(true); }}
            aria-invalid={looksWrong}
            aria-describedby="salon-sms-number-help"
          />
          <p id="salon-sms-number-help" className="text-xs text-muted-foreground">
            The full international form, starting with +. This is what clients see when you text
            them, and the number their replies come back to.
          </p>
          {looksWrong && (
            <p className="text-xs font-medium text-destructive">
              Twilio cannot send from that. It needs to look like +61412345678 — no spaces, no
              brackets, and not a placeholder.
            </p>
          )}
        </div>

        {data.usingSharedNumber && (
          <p className="flex items-start gap-1.5 rounded-md bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              No number of your own is set, so texts go out from the shared Groomigo number. That
              works — it is what is sending today — but replies and missed calls are easier to
              match to your salon when the number is yours.
            </span>
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={save.isPending || looksWrong || unchanged}
            onClick={() => save.mutate({ number: trimmed === "" ? null : trimmed })}
          >
            {save.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            Save number
          </Button>
          {data.number && (
            <Button
              variant="outline"
              size="sm"
              disabled={save.isPending}
              onClick={() => { setDraft(""); save.mutate({ number: null }); }}
            >
              Use the shared number
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
