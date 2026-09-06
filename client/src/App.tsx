import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// Pages — Admin
import Dashboard from "./pages/Dashboard";
import Calendar from "./pages/Calendar";
import WorkflowBoard from "./pages/WorkflowBoard";
import WorkflowDisplay from "./pages/WorkflowDisplay";
import StaffPortal from "./pages/StaffPortal";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Memberships from "./pages/Memberships";
import Retail from "./pages/Retail";
import Analytics from "./pages/Analytics";
import Staff, { StaffReviewProfile } from "./pages/Staff";
import Messages from "./pages/Messages";
import EmailCampaigns from "./pages/EmailCampaigns";
import Reporting from "./pages/Reporting";
import Migration from "./pages/Migration";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

// Pages — Public (no auth)
import PetTracker from "./pages/PetTracker";
import OnlineBooking from "./pages/OnlineBooking";
import Login from "./pages/Login";
import StaffInvitationAccept from "./pages/StaffInvitationAccept";
import ClientPortal from "./pages/ClientPortal";
import ClientPortalLogin from "./pages/ClientPortalLogin";
import ClientPortalSetup from "./pages/ClientPortalSetup";

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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
