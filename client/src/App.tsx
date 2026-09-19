import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import { lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// Pages are lazy-loaded so the initial download is a small, focused chunk
// per page rather than one ~1.8MB bundle containing every page in the app.
// On a slow/congested connection (e.g. salon WiFi shared across several
// staff phones at once), a single giant bundle is much more likely to fail
// or time out partway through downloading \u2014 which shows as a completely
// blank white page, since that failure happens before React (and its error
// boundary) ever gets a chance to run. Smaller, focused chunks are far more
// likely to complete even on a poor connection.

// Pages — Admin
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Calendar = lazy(() => import("./pages/Calendar"));
const WorkflowBoard = lazy(() => import("./pages/WorkflowBoard"));
const WorkflowDisplay = lazy(() => import("./pages/WorkflowDisplay"));
const StaffPortal = lazy(() => import("./pages/StaffPortal"));
const Clients = lazy(() => import("./pages/Clients"));
const ClientDetail = lazy(() => import("./pages/ClientDetail"));
const Memberships = lazy(() => import("./pages/Memberships"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Retail = lazy(() => import("./pages/Retail"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Staff = lazy(() => import("./pages/Staff").then(m => ({ default: m.default })));
const StaffReviewProfile = lazy(() => import("./pages/Staff").then(m => ({ default: m.StaffReviewProfile })));
const Messages = lazy(() => import("./pages/Messages"));
const EmailCampaigns = lazy(() => import("./pages/EmailCampaigns"));
const Reporting = lazy(() => import("./pages/Reporting"));
const Migration = lazy(() => import("./pages/Migration"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Pages — Public (no auth)
const PetTracker = lazy(() => import("./pages/PetTracker"));
const OnlineBooking = lazy(() => import("./pages/OnlineBooking"));
const Login = lazy(() => import("./pages/Login"));
const StaffInvitationAccept = lazy(() => import("./pages/StaffInvitationAccept"));
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const ClientPortalLogin = lazy(() => import("./pages/ClientPortalLogin"));
const ClientPortalSetup = lazy(() => import("./pages/ClientPortalSetup"));

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
      <Route path="/clients/:id" component={ClientDetail} />
      <Route path="/memberships" component={Memberships} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/retail" component={Retail} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/staff/review/:staffId" component={StaffReviewProfile} />
      <Route path="/staff" component={Staff} />
      <Route path="/messages" component={Messages} />
      <Route path="/email-campaigns" component={EmailCampaigns} />
      <Route path="/reporting" component={Reporting} />
      <Route path="/migration" component={Migration} />
      <Route path="/settings" component={Settings} />

      {/* Public — no auth required */}
      <Route path="/login" component={Login} />
      <Route path="/staff-invite/:token" component={StaffInvitationAccept} />
      <Route path="/book" component={OnlineBookingPublic} />
      <Route path="/book/preview" component={OnlineBookingPreview} />
      <Route path="/track/:token" component={PetTracker} />
      <Route path="/portal" component={ClientPortal} />
      <Route path="/portal/login" component={ClientPortalLogin} />
      <Route path="/portal/setup/:token" component={ClientPortalSetup} />
      <Route path="/portal/:token" component={ClientPortal} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
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
