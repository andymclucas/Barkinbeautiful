import { Bell, Check, Lock, PauseCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { describeAutomatedSms, type AutomatedSmsRow } from "@shared/automatedSmsCatalogue";

/**
 * Which automated texts actually reach a client.
 *
 * ## What was here before
 *
 * Four hand-written rows and four "Configure" buttons that each raised
 * "Feature coming soon". Two of the rows were about staff alerts, not
 * client texts, sitting under a heading that reads "Texts the system sends
 * on the salon's behalf" — so the screen implied the salon texted clients
 * about retail stock levels. The other two said:
 *
 *   "Appointment reminders — OFF, automated texts to clients are switched off"
 *
 * Andy reversed that rule on 04/11/2026 and the allow-list had carried
 * seven entries for three days. The owner's own settings screen was telling
 * him the opposite of what his salon was doing, and no test failed, because
 * the sentence was copy rather than a reading of anything.
 *
 * ## Why it is built this way
 *
 * The rows come from `ALLOWED_AUTOMATED_SMS` by way of
 * shared/automatedSmsCatalogue.ts, so adding a type to the allow-list
 * updates this screen without anybody editing it. The state comes from the
 * SERVER, because `SMS_AUTOMATION_ENABLED` has no `VITE_` prefix and the
 * browser genuinely cannot see it — rendering from the allow-list alone
 * would show seven messages as going out while the environment held every
 * one of them back.
 *
 * There are no toggles, because there is nothing here a toggle could do:
 * switching one of these on is a code change (CLAUDE.md §9), and a switch
 * that silently does nothing is worse than no switch — which is what the
 * Workflow board's dead "Add Walk-in" button cost us earlier the same day.
 */

/** Pure half, so the states can be tested without a tRPC provider. */
export function ClientMessagingCardView({
  automationEnabled,
  messages,
}: {
  automationEnabled: boolean;
  messages: readonly AutomatedSmsRow[];
}) {
  const sending = messages.filter((m) => m.state === "allowed");
  const gated = messages.filter((m) => m.state === "blocked_by_salon_gate");
  const offByPolicy = messages.filter((m) => m.state === "off_by_policy");

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" /> Client messaging
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {sending.length > 0
            ? `${sending.length} of ${messages.length} automated texts can reach a client right now.`
            : "No automated text can reach a client right now."}{" "}
          Anything a person presses send on is unaffected by this list.
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4 text-sm">
        {/* The salon-wide gate, stated once rather than repeated on every
            row. It was previously invisible in the UI entirely, so there
            was no way to tell "we chose not to send this" from "this would
            send but the environment is holding it". */}
        {!automationEnabled && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 p-3">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              Automated texting is switched off for the whole salon
            </p>
            <p className="text-xs text-amber-900/80 dark:text-amber-200/80 mt-0.5">
              Nothing below goes out, whatever it says, until SMS_AUTOMATION_ENABLED is set in the
              salon&rsquo;s environment. Staff can still text clients by hand.
            </p>
          </div>
        )}

        {sending.length > 0 && (
          <MessageGroup
            heading="Going out automatically"
            icon={<Check className="h-3.5 w-3.5" />}
            badge="On"
            badgeVariant="default"
            rows={sending}
          />
        )}

        {gated.length > 0 && (
          <MessageGroup
            heading="Allowed, but held by the salon switch"
            icon={<PauseCircle className="h-3.5 w-3.5" />}
            badge="Paused"
            badgeVariant="secondary"
            rows={gated}
          />
        )}

        {offByPolicy.length > 0 && (
          <MessageGroup
            heading="Deliberately off"
            icon={<Lock className="h-3.5 w-3.5" />}
            badge="Off"
            badgeVariant="outline"
            rows={offByPolicy}
            footnote="Turning one of these on is a code change, not a setting — it has to be added to the allow-list in shared/automatedSms.ts, in front of the note explaining why it is off."
          />
        )}
      </CardContent>
    </Card>
  );
}

function MessageGroup({
  heading,
  icon,
  badge,
  badgeVariant,
  rows,
  footnote,
}: {
  heading: string;
  icon: React.ReactNode;
  badge: string;
  badgeVariant: "default" | "secondary" | "outline";
  rows: readonly AutomatedSmsRow[];
  footnote?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        {icon} {heading}
      </p>
      <div>
        {rows.map((row) => (
          <div
            key={row.type}
            className="flex items-start justify-between gap-3 py-2 border-b last:border-0"
          >
            <div className="min-w-0">
              <p className="font-medium">{row.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{row.when}</p>
              {row.caveat && (
                <p className="text-xs text-muted-foreground/80 mt-1 italic">{row.caveat}</p>
              )}
            </div>
            <Badge variant={badgeVariant} className="shrink-0">
              {badge}
            </Badge>
          </div>
        ))}
      </div>
      {footnote && <p className="text-xs text-muted-foreground pt-1">{footnote}</p>}
    </div>
  );
}

export function ClientMessagingCard() {
  const { data, isLoading } = trpc.automatedMessages.list.useQuery();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }

  // The server is the only thing that knows about the environment gate.
  // Falling back to the allow-list with the gate assumed ON would be the
  // optimistic lie this card exists to stop, so assume OFF: the banner
  // then says nothing is going out, which is the safe direction to be
  // wrong in for something that texts real people.
  if (!data) {
    return <ClientMessagingCardView automationEnabled={false} messages={describeAutomatedSms(false)} />;
  }

  return <ClientMessagingCardView automationEnabled={data.automationEnabled} messages={data.messages} />;
}
