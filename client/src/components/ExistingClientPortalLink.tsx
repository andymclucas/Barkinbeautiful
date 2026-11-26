import { LogIn } from "lucide-react";

/**
 * "Already a client?" on the public booking page.
 *
 * Lauren, 26/11/2026: "good for 1st time bookings. maybe needs a link for
 * existing client's to register their account for the portal or log into
 * their account to book tab."
 *
 * Existing clients book in the portal, where their own dogs, prices and
 * membership are known; this page prices everyone as a new client. The
 * portal has no self sign-up: an account starts with the salon's
 * invitation, so the second line says to ask for one rather than offering
 * a registration this page cannot honour.
 *
 * A relative link: the booking page is served on the client host, where
 * /portal/login is the portal's own sign-in.
 */
export function ExistingClientPortalLink({ salonName }: { salonName?: string | null }) {
  const who = salonName?.trim() || "the salon";
  return (
    <div
      className="mb-6 flex flex-col gap-3 rounded-2xl border border-violet-300/30 bg-white/10 p-4 text-white backdrop-blur sm:flex-row sm:items-center sm:justify-between"
      data-testid="existing-client-portal-link"
    >
      <div>
        <p className="font-semibold">Already a client?</p>
        <p className="text-sm text-violet-100">
          Book in your client portal, with your dogs and prices already there.
          Not set up yet? Ask {who} to send your portal invite.
        </p>
      </div>
      <a
        href="/portal/login"
        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-violet-900 hover:bg-violet-100"
      >
        <LogIn className="h-4 w-4" aria-hidden /> Sign in to your portal
      </a>
    </div>
  );
}
