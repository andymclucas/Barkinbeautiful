import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Redirect, Route, Switch } from "wouter";
import { Suspense } from "react";
import { lazyPage } from "@/lib/lazyPage";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// lazyPage rather than React's lazy: the two differ only when a chunk
// fails to load, which after a deploy means it no longer exists. See
// client/src/lib/lazyPage.ts.
//
// Pages are lazy-loaded so the initial download is a small, focused chunk
// per page rather than one ~1.8MB bundle containing every page in the app.
// On a slow/congested connection (e.g. salon WiFi shared across several
// staff phones at once), a single giant bundle is much more likely to fail
// or time out partway through downloading \u2014 which shows as a completely
// blank white page, since that failure happens before React (and its error
// boundary) ever gets a chance to run. Smaller, focused chunks are far more
// likely to complete even on a poor connection.

// Pages — Admin
const Dashboard = lazyPage(() => import("./pages/Dashboard"));
const Calendar = lazyPage(() => import("./pages/Calendar"));
const WorkflowBoard = lazyPage(() => import("./pages/WorkflowBoard"));
const WorkflowDisplay = lazyPage(() => import("./pages/WorkflowDisplay"));
const StaffPortal = lazyPage(() => import("./pages/StaffPortal"));
const Clients = lazyPage(() => import("./pages/Clients"));
const OverdueForGroom = lazyPage(() => import("@/pages/OverdueForGroom"));
const ClientDetail = lazyPage(() => import("./pages/ClientDetail"));
const Memberships = lazyPage(() => import("./pages/Memberships"));
const Pricing = lazyPage(() => import("./pages/Pricing"));
const Retail = lazyPage(() => import("./pages/Retail"));
const Analytics = lazyPage(() => import("./pages/Analytics"));
const Staff = lazyPage(() => import("./pages/Staff").then(m => ({ default: m.default })));
const StaffReviewProfile = lazyPage(() => import("./pages/Staff").then(m => ({ default: m.StaffReviewProfile })));
const Messages = lazyPage(() => import("./pages/Messages"));
const PortalInbox = lazyPage(() => import("./pages/PortalInbox"));
const EmailCampaigns = lazyPage(() => import("./pages/EmailCampaigns"));
const Reporting = lazyPage(() => import("./pages/Reporting"));
const Migration = lazyPage(() => import("./pages/Migration"));
const Settings = lazyPage(() => import("./pages/Settings"));
const NotFound = lazyPage(() => import("./pages/NotFound"));

// Pages — Public (no auth)
const PetTracker = lazyPage(() => import("./pages/PetTracker"));
const OnlineBooking = lazyPage(() => import("./pages/OnlineBooking"));
const MembershipSignup = lazyPage(() => import("./pages/MembershipSignup"));
const ClientPhotoUpload = lazyPage(() => import("./pages/ClientPhotoUpload"));
const WaitlistOffer = lazyPage(() => import("./pages/WaitlistOffer"));
const WaitlistJoin = lazyPage(() => import("./pages/WaitlistJoin"));
const Login = lazyPage(() => import("./pages/Login"));
const SalonSignup = lazyPage(() => import("./pages/SalonSignup"));
const StaffInvitationAccept = lazyPage(() => import("./pages/StaffInvitationAccept"));
const ClientPortal = lazyPage(() => import("./pages/ClientPortal"));
const GroomingCard = lazyPage(() => import("./pages/GroomingCard"));
const ClientPortalLogin = lazyPage(() => import("./pages/ClientPortalLogin"));
const ClientPortalSetup = lazyPage(() => import("./pages/ClientPortalSetup"));
const ClientPortalCardResult = lazyPage(() => import("./pages/ClientPortalCardResult"));
const ClientInvoiceResult = lazyPage(() => import("./pages/ClientInvoiceResult"));

/** Small, immediate visual feedback while a page chunk downloads — never
 * leaves the screen blank, even on a slow connection. */
function RouteLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
    </div>
  );
}

function OnlineBookingPreview() {
  return <OnlineBooking previewMode />;
}

function OnlineBookingPublic() {
  return <OnlineBooking />;
}

function Router() {
  return (
    <Switch>
      {/* Admin routes */}
      <Route path="/" component={Dashboard} />
      <Route path="/calendar" component={Calendar} />
      <Route path="/workflow" component={WorkflowBoard} />
      <Route path="/workflow/display" component={WorkflowDisplay} />
      <Route path="/my-day" component={StaffPortal} />
      <Route path="/clients" component={Clients} />
      {/* Before /clients/:id — wouter would otherwise read "overdue" as an id. */}
      <Route path="/clients/overdue" component={OverdueForGroom} />
      <Route path="/clients/:id" component={ClientDetail} />
      <Route path="/memberships" component={Memberships} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/retail" component={Retail} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/staff/review/:staffId" component={StaffReviewProfile} />
      <Route path="/staff" component={Staff} />
      <Route path="/messages" component={Messages} />
      <Route path="/portal-messages" component={PortalInbox} />
      <Route path="/email-campaigns" component={EmailCampaigns} />
      <Route path="/reporting" component={Reporting} />
      <Route path="/migration" component={Migration} />
      <Route path="/settings" component={Settings} />

      {/* Public — no auth required */}
      <Route path="/login" component={Login} />
      {/* Public, and the only route that creates a salon. */}
      <Route path="/signup" component={SalonSignup} />
      <Route path="/staff-invite/:token" component={StaffInvitationAccept} />
      <Route path="/book" component={OnlineBookingPublic} />
      <Route path="/join" component={MembershipSignup} />
      <Route path="/photo/:token" component={ClientPhotoUpload} />
      <Route path="/slot/:token" component={WaitlistOffer} />
      <Route path="/waitlist" component={WaitlistJoin} />
      <Route path="/book/preview" component={OnlineBookingPreview} />
      <Route path="/track/:token" component={PetTracker} />
      {/* Public grooming card. The token is the authorisation, same as /track. */}
      <Route path="/card/:token" component={GroomingCard} />
      <Route path="/portal" component={ClientPortal} />
      <Route path="/portal/login" component={ClientPortalLogin} />
      <Route path="/portal/setup/:token" component={ClientPortalSetup} />
      {/* Stripe returns here after a card setup link. These must stay above
          "/portal/:token", which would otherwise match "card-saved" as a
          token and show the client an error right after they handed over
          their card. */}
      {/* Admin preview of a client's portal. Two segments, so it cannot be
          mistaken for a one-segment access token. */}
      <Route path="/portal/preview/:previewClientId" component={ClientPortal} />
      {/* Same trap, same rule: these must stay above "/portal/:token", or
          "invoice-paid" is read as an access token and a client who has
          just paid is shown an error. */}
      <Route path="/portal/invoice-paid">{() => <ClientInvoiceResult paid />}</Route>
      <Route path="/portal/invoice-cancelled">{() => <ClientInvoiceResult paid={false} />}</Route>
      <Route path="/portal/card-saved">{() => <ClientPortalCardResult saved />}</Route>
      <Route path="/portal/card-cancelled">{() => <ClientPortalCardResult saved={false} />}</Route>
      <Route path="/portal/:token" component={ClientPortal} />

      {/* Aliases for paths staff have bookmarked that were never routes.
          The dashboard lives at "/", so a bookmark saved as "/dashboard"
          hit the 404 page instead. Redirect rather than 404 — a dead
          bookmark looks like the whole system is down to someone standing
          at the counter. */}
      <Route path="/dashboard"><Redirect to="/" /></Route>
      <Route path="/home"><Redirect to="/" /></Route>
      <Route path="/appointments"><Redirect to="/calendar" /></Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Suspense fallback={<RouteLoadingFallback />}>
            <Router />
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
