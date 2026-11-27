import { Button } from "@/components/ui/button";

/**
 * The last look before an online booking is sent.
 *
 * Andy, 27/11/2026: a client picked a de-shed when she wanted a shave, and
 * nothing asked her to check. This reads back exactly what was chosen, with
 * what the service includes, so a wrong pick is caught before it reaches
 * the salon. It is a request either way: staff still approve it
 * (shared/bookingRequests.ts).
 */
export function CheckBookingStep({
  rows,
  sending,
  onBack,
  onSend,
}: {
  /** [label, value, optional smaller line under the value] */
  rows: Array<[string, string, string?]>;
  sending: boolean;
  onBack: () => void;
  onSend: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="check-booking-title"
      data-testid="check-booking"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-2xl bg-card p-5 text-card-foreground shadow-2xl">
        <h2 id="check-booking-title" className="text-lg font-bold">Check your booking</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Please make sure this is right before sending. It is a request until our team approves it.
        </p>
        <dl className="mt-4 divide-y rounded-xl border text-sm">
          {rows.map(([label, value, sub]) => (
            <div key={label} className="grid grid-cols-[88px_1fr] gap-3 px-3 py-2.5">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>
                <span className="font-medium">{value}</span>
                {sub && <span className="mt-0.5 block text-xs text-muted-foreground">{sub}</span>}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onBack}>Go back and change</Button>
          <Button className="bg-violet-700 hover:bg-violet-800" disabled={sending} onClick={onSend}>
            Yes, send my request
          </Button>
        </div>
      </div>
    </div>
  );
}
