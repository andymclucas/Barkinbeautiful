import { useTimezoneSync } from "@/lib/timezone";
import { isStaffOperationRoute } from "@shared/staffRoutes";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme, type ThemeChoice } from "@/contexts/ThemeContext";
import NotificationBell from "@/components/NotificationBell";
import { GlobalSearch } from "@/components/GlobalSearch";
import { SalonSwitcher } from "@/components/SalonSwitcher";
import SystemNotificationBell from "@/components/SystemNotificationBell";
import IncomingCallAlert from "@/components/IncomingCallAlert";
import { TrialBanner } from "@/components/TrialBanner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { sidebarEntriesFor, groupContaining, type SidebarGroupKey } from "@shared/sidebarNavigation";
import { useSidebarHover } from "@/hooks/useSidebarHover";
import {
  CalendarDays,
  Workflow,
  CreditCard,
  Users,
  BarChart3,
  UserCog,
  DollarSign,
  MessageSquare,
  MessageCircle,
  Mail,
  FileBarChart2,
  Banknote,
  MessagesSquare,
  LineChart,
  LogOut,
  PanelLeft,
  ChevronDown,
  UserRound,
  Sun,
  Moon,
  MonitorSmartphone,
  Scissors,
  ImagePlus,
  ImageOff,
  Palette,
  Settings,
} from "lucide-react";
import { ComponentType, CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { trpc } from "@/lib/trpc";
import { applyBrandTheme } from "@/lib/brandTheme";
import { FestiveGarland } from "@/components/FestiveGarland";
import { FestiveSnow } from "@/components/FestiveSnow";
import { StaffAvatar } from "@/components/StaffAvatar";
import { MyProfileDialog } from "@/components/MyProfileDialog";
import { canAdministerStaff } from "@shared/staffAdministrators";
import { viewableSections, STAFF_SECTIONS } from "@shared/staffPermissions";
import { seasonYearFor } from "@shared/christmasCountdown";
import { brisbaneDay } from "@shared/collectBy";
import { toast } from "sonner";
import { useSalonDocumentTitle } from "@/hooks/useSalonDocumentTitle";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

/**
 * A row in the sidebar.
 *
 * `icon` is typed as a plain component rather than LucideIcon because one of
 * these rows renders an emoji — see ChristmasTreeIcon.
 *
 * `className` is how a single row gets its own treatment without the map
 * growing a branch that everyone adding a nav item then has to read. Only
 * the Christmas row uses it today.
 */
type NavItem = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  path: string;
  className?: string;
};

const menuItems: NavItem[] = [
  { icon: CalendarDays,   label: "Appointments",      path: "/calendar" },
  { icon: Workflow,       label: "Workflow Board",    path: "/workflow" },
  { icon: Users,          label: "Clients & Pets",    path: "/clients" },
  { icon: CreditCard,     label: "Memberships",       path: "/memberships" },
  { icon: DollarSign,     label: "Pricing & Services", path: "/pricing" },
  { icon: MessageSquare,  label: "Messages",          path: "/messages" },
  { icon: MessageCircle,  label: "Portal Messages",   path: "/portal-messages" },
  { icon: Mail,           label: "Email Campaigns",   path: "/email-campaigns" },
  { icon: BarChart3,      label: "Analytics",         path: "/analytics" },
  { icon: FileBarChart2,  label: "Reporting",         path: "/reporting" },
  { icon: UserCog,        label: "Staff",             path: "/staff" },
];

/**
 * The icon a group wears when it is closed.
 *
 * A group is not a page, so it has no nav item of its own to take an
 * icon from — and a row with no icon sits a few pixels left of every
 * other row, which reads as a rendering fault rather than a heading.
 */
const GROUP_ICON: Record<SidebarGroupKey, ComponentType<{ className?: string }>> = {
  financials: Banknote,
  communication: MessagesSquare,
  insights: LineChart,
};

const sectionPath = (key: string): string => STAFF_SECTIONS.find((s) => s.key === key)?.path ?? "";

// The sidebar a restricted staff account sees. Same rule as the route
// guard: a link to a page they would be bounced off is worse than no link.
const staffOperationMenuItems = menuItems.filter((item) => isStaffOperationRoute(item.path));

/**
 * Only in the run-up, and shown to everyone including restricted staff.
 *
 * Andy, 02/11/2026: "Add it to the sidebar too." It is a dog count with
 * no money in it, and the groomers doing the grooming are who it is
 * for — the matching procedure is operational for the same reason.
 *
 * Appended rather than placed in menuItems so it cannot drift into the
 * permanent list once Christmas is over.
 */
/**
 * Andy, 02/11/2026: "have an Christmas emoji for the title on the sidebar."
 *
 * It goes in the icon slot rather than on the front of the label, so the
 * row is not a tree emoji next to a lucide tree. The loop renders
 * item.icon as a component and hands it a className, so an emoji has to
 * arrive as one too — the alternative is special-casing the map, which
 * would then have to be understood by everyone who ever adds a nav item.
 *
 * The className it is given carries text colours for the active and
 * hover states. They do nothing to a colour emoji, which is fine: this
 * row is meant to stand out from the greyscale list, and that is the
 * whole reason for asking for an emoji.
 */
function ChristmasTreeIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`${className ?? ""} inline-flex items-center justify-center text-[15px] leading-none`}
    >
      🎄
    </span>
  );
}

const christmasMenuItem: NavItem = {
  icon: ChristmasTreeIcon,
  label: "Christmas Countdown",
  path: "/christmas",
  // Andy, 02/11/2026: "make that button flash red and green like Christmas
  // lights when you hover over it." The keyframes are in index.css, next to
  // the nav hover rule and for the same reason — see "Christmas lights".
  className: "nav-christmas-lights",
};


/** Perceived luminance 0–1 for a #rrggbb hex colour. */
/** Quick brand-colour editor rendered in a Dialog. */
function BrandColoursDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const utils = trpc.useUtils();
  const { data: tenant } = trpc.settings.getTenantInfo.useQuery({});
  // Publish the signed-in user's zone to module scope so the plain formatting
  // helpers — the ones that are not components — render in it too.
  useTimezoneSync();
  const [colors, setColors] = useState({ primary: "#d61572", sidebar: "#1e1229", accent: "#f9d4e7" });

  useEffect(() => {
    if (tenant) setColors({
      primary: tenant.brandPrimary  ?? "#d61572",
      sidebar: tenant.brandSidebar  ?? "#1e1229",
      accent:  tenant.brandAccent   ?? "#f9d4e7",
    });
  }, [tenant]);

  const save = trpc.settings.updateTenantInfo.useMutation({
    onSuccess: () => {
      utils.settings.getTenantInfo.invalidate({});
      toast.success("Brand colours saved");
      onOpenChange(false);
    },
    onError: () => toast.error("Could not save colours"),
  });

  // Previews through the same applier the saved theme uses, so what a
  // salon sees while dragging the picker is what they get on reload.
  const preview = (next: typeof colors) => { applyBrandTheme(next); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4 text-primary" /> Brand colours
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">Changes preview live — save to keep them.</p>
        <div className="space-y-3 py-1">
          {([
            { k: "primary", l: "Primary colour",  d: "Buttons & key actions" },
            { k: "sidebar", l: "Sidebar colour",   d: "Navigation background" },
            { k: "accent",  l: "Accent colour",    d: "Surfaces & highlights" },
          ] as const).map(({ k, l, d }) => (
            <div key={k} className="flex items-center gap-3 rounded-xl border p-2.5">
              <input
                type="color"
                value={colors[k]}
                onChange={e => { const n = { ...colors, [k]: e.target.value }; setColors(n); preview(n); }}
                className="h-9 w-11 rounded-md border cursor-pointer p-0.5 bg-transparent"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-none">{l}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{d}</p>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">{colors[k]}</span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            disabled={save.isPending}
            onClick={() => save.mutate({ brandPrimary: colors.primary, brandAccent: colors.accent, brandSidebar: colors.sidebar })}
          >
            {save.isPending ? "Saving…" : "Save colours"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();
  // "Groomigo — <salon>" in the browser tab. Here rather than at App level
  // because it reads the tenant, and the portal and tracker pages are opened
  // by clients who have no staff session.
  useSalonDocumentTitle();
  // Every tab in the salon refetches what it is showing the moment anyone
  // changes anything. In the staff shell rather than at App level: the portal
  // and tracker are opened by clients, who have no staff session and would
  // get a 401 on the stream.
  useRealtimeInvalidation();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    if (loading || typeof window === "undefined") return;
    if (!user) {
      if (window.location.pathname !== "/login") window.location.href = "/login";
      return;
    }
    if (user.role === "staff" && !isStaffOperationRoute(window.location.pathname)) {
      window.location.href = "/calendar";
    }
  }, [loading, user]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return <DashboardLayoutSkeleton />;
  }

  if (user.role === "staff" && !isStaffOperationRoute(window.location.pathname)) {
    return <DashboardLayoutSkeleton />;
  }

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (w: number) => void;
}) {
  const { user, logout } = useAuth();
  const { theme, resolvedTheme, setTheme, toggleTheme, festive, setFestive, toggleFestive, snowing } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { data: tenantBranding } = trpc.settings.getTenantInfo.useQuery({});
  // The signed-in user's own staff record, so they can set their own profile
  // photo from here. Returns null for accounts with no staff row, in which case
  // the control is simply not offered.
  const { data: myStaff, refetch: refetchMyStaff } = trpc.staff.getMyProfile.useQuery();


  useEffect(() => applyBrandTheme({
    primary: tenantBranding?.brandPrimary,
    accent: tenantBranding?.brandAccent,
    sidebar: tenantBranding?.brandSidebar,
    font: tenantBranding?.brandFont,
  }), [tenantBranding]);

  const activeMenuItem = menuItems.find(
    (item) => location === item.path || location.startsWith(item.path + "/")
  );
  /**
   * Which sections this person sees.
   *
   * A granted set is ADDITIVE: it widens a restricted staff account beyond
   * the three operational screens to whatever the owner ticked. It never
   * narrows an existing admin, because the four groomers who hold
   * users.role = "admin" today would lose the floor the moment this shipped.
   * Move someone onto a grant deliberately, then take the blanket admin away.
   *
   * VIEWABLE, not editable. A bather is given Clients and Memberships to
   * read — they need to know a dog is nervous or a groom is covered — and
   * cannot change either. Keying the nav off the edit grant hid the pages
   * from the people the read-only grant was invented for, which made the
   * whole view/edit split pointless from the sidebar's side.
   */
  const grantedPaths: ReadonlySet<string> | null = myStaff?.isAdmin
    ? new Set<string>(viewableSections(myStaff).map(sectionPath))
    : null;
  /**
   * Counts only, polled on a slow timer. A minute is plenty for "someone is
   * waiting": the pages themselves refresh faster, and this runs on every
   * screen for every signed-in person.
   */
  const { data: counts } = trpc.sidebarCounts.get.useQuery(
    {},
    { refetchInterval: 60000, refetchOnWindowFocus: true },
  );
  const navBadges: Record<string, number> = {
    "/messages": counts?.messages ?? 0,
    "/portal-messages": counts?.portalMessages ?? 0,
  };

  const permittedMenuItems =
    user?.role === "staff"
      ? menuItems.filter(
          (item) => staffOperationMenuItems.includes(item) || grantedPaths?.has(item.path),
        )
      : menuItems;
  /* The salon's calendar day, not the browser's clock read in UTC —
     Brisbane's first ten hours of 1 November are still October there,
     and the link would be missing for the morning it starts. The page
     behind it asks the server for the real figures either way. */
  /*
   * Hover opens a group on a computer, a tap opens it on a phone.
   *
   * Andy, 05/11/2026: "On computer, hover over will expand the menus, if
   * clicked on device (phone etc) they expand drop down."
   *
   * `(hover: hover)` is the honest test for that — not screen width. A
   * small laptop window has a mouse and should still open on hover, and
   * a large tablet has no mouse and must not open a menu the moment a
   * finger grazes it. Touch devices report `(hover: none)`, so they get
   * the click behaviour whatever their size.
   */
  const [pointerHasHover, setPointerHasHover] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setPointerHasHover(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  /* The person's own setting, from My profile. Hover can only open a
     group on a device that HAS hover, so the two are an AND. */
  const { hoverOpens: hoverPreferred } = useSidebarHover();
  const hoverOpens = pointerHasHover && hoverPreferred;

  /*
   * Clicked open and hovered open are different things, and conflating
   * them is what made the groups un-clickable.
   *
   * Andy, 05/11/2026: "Make them clickable - not just expand on hover."
   * With one set, a click opened a group and the mouse leaving closed
   * it again a moment later, so clicking appeared to do nothing at all.
   *
   * `openGroups` is what you clicked and stays until you click it
   * again. `hoveredGroup` is where the pointer is and goes when it
   * leaves. A group is open if either says so.
   */
  const [openGroups, setOpenGroups] = useState<ReadonlySet<SidebarGroupKey>>(new Set());
  const [hoveredGroup, setHoveredGroup] = useState<SidebarGroupKey | null>(null);
  const toggleGroup = (key: SidebarGroupKey) =>
    setOpenGroups((open) => {
      const next = new Set(open);
      if (next.has(key)) {
        next.delete(key);
        // Clicking a hovered-open group shut has to actually shut it,
        // not leave it held open by the pointer that is still on it.
        setHoveredGroup((current) => (current === key ? null : current));
      } else {
        next.add(key);
      }
      return next;
    });

  const inChristmasSeason = seasonYearFor(brisbaneDay(new Date()) ?? "") !== null;
  const visibleMenuItems = inChristmasSeason
    ? [...permittedMenuItems, christmasMenuItem]
    : permittedMenuItems;

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - left;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);


  /**
   * Notifications and the signed-in user, top right.
   *
   * Both used to be in the sidebar: the bell wedged in beside the collapse
   * toggle, the profile at the very bottom of the rail - where, collapsed,
   * the owner's own photo was a 32px dot nobody ever saw. Top right is where
   * MoeGo puts them, and where every app the salon uses puts them.
   */
  const myStaffRoleLabel = myStaff?.role
    ? myStaff.role.charAt(0).toUpperCase() + myStaff.role.slice(1)
    : null;

  const accountControls = (
    <div className="flex items-center gap-1.5">
      {/* One tap for the common case. The three-way choice, including
          "follow my device", lives in the menu below. */}
      {/* Andy, 03/11/2026: "Add a little Christmas tree icon that then
          switches it to a Christmas theme." Beside the moon, because it
          is the same KIND of control — how the app looks, not what it
          does — and it recolours rather than replacing light or dark,
          so the two compose. */}
      <button
        type="button"
        onClick={toggleFestive}
        aria-pressed={festive}
        aria-label={festive ? "Turn off the Christmas theme" : "Turn on the Christmas theme"}
        title={festive ? "Turn off the Christmas theme" : "Turn on the Christmas theme"}
        /*
         * Hidden on a phone, where the header has 375px to fit a menu
         * trigger, a centred search and the account controls - and the
         * controls alone wanted 204 of it. The tree moves into the
         * Appearance menu rather than disappearing.
         */
        className={`hidden h-9 w-9 items-center justify-center rounded-xl text-[17px] leading-none transition-colors hover:bg-accent/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex ${
          festive ? "bg-accent/70" : "opacity-70 hover:opacity-100"
        }`}
      >
        <span aria-hidden>🎄</span>
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        /* Hidden on a phone for the same reason as the tree. Nothing is
           lost: Light / Dark / Match my device are already in the menu,
           so this button was always the shortcut rather than the only
           way. */
        className="hidden h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
      >
        {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <SystemNotificationBell />
      <NotificationBell />
      <IncomingCallAlert />
      <div className="mx-1 hidden h-6 w-px bg-accent sm:block" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex max-w-[15rem] items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-accent/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <StaffAvatar
                photoUrl={myStaff?.photoUrl}
                name={myStaff?.name ?? user?.name}
                colourHex={myStaff?.colourHex}
                className="h-9 w-9 shrink-0"
              />
              {/* The name is worth the width on a desktop header and not
                  on a phone, where the photo alone identifies the account. */}
              <div className="hidden min-w-0 md:block">
                <p className="truncate text-sm font-semibold leading-tight text-foreground">
                  {user?.name || "-"}
                  {myStaffRoleLabel && <span className="font-normal text-muted-foreground"> ({myStaffRoleLabel})</span>}
                </p>
                <p className="truncate text-xs leading-tight text-muted-foreground">{user?.email || "-"}</p>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={(e) => { e.preventDefault(); setProfileOpen(true); }}
            >
              <UserRound className="mr-2 h-4 w-4" />
              <span>My profile</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Appearance. "System" is offered explicitly because a device
                that switches at sunset should take the app with it, and that
                is not something a two-state toggle can express. */}
            <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Appearance
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemeChoice)}>
              <DropdownMenuRadioItem value="light" className="cursor-pointer">
                <Sun className="mr-2 h-4 w-4" /> Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark" className="cursor-pointer">
                <Moon className="mr-2 h-4 w-4" /> Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system" className="cursor-pointer">
                <MonitorSmartphone className="mr-2 h-4 w-4" /> Match my device
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            {/*
              * The tree, in the menu as well as the header.
              *
              * The header button is hidden on a phone to make room for the
              * centred search, so without this there would be no way to
              * reach the Christmas theme on a phone at all. It is a
              * checkbox rather than a fourth radio item because festive
              * layers OVER light or dark rather than replacing either.
              */}
            <DropdownMenuCheckboxItem
              checked={festive}
              onCheckedChange={setFestive}
              className="cursor-pointer"
            >
              <span aria-hidden className="mr-2">🎄</span> Christmas theme
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {/* Salon-wide, so only the owner sees it. The server enforces
                this too - hiding a menu item is not access control. */}
            {canAdministerStaff(user) && (
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => setBrandDialogOpen(true)}
              >
                <Palette className="mr-2 h-4 w-4" />
                <span>Brand colours</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => setLocation("/settings")}
            >
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={logout}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <BrandColoursDialog open={brandDialogOpen} onOpenChange={setBrandDialogOpen} />
    </div>
  );

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r-0" disableTransition={isResizing}>
          {/* ── Header ── */}
          <SidebarHeader className="h-[4.5rem] justify-center border-b border-sidebar-border">
            <div className="flex items-center gap-3 px-2 w-full">
              <button
                onClick={toggleSidebar}
                className="h-9 w-9 flex items-center justify-center rounded-xl bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed && (
                <div
                  className="flex items-center cursor-pointer min-w-0 flex-1"
                  onClick={() => setLocation("/")}
                >
                  <img
                    src="/barkin_beautiful_logo.png"
                    alt="Barkin' Beautiful Grooming Studio"
                    className="h-10 w-auto object-contain max-w-full"
                  />
                </div>
              )}
            </div>
          </SidebarHeader>

          {/*
            * Hung from the header's bottom edge, over the top of the nav.
            * `pointer-events-none` and out of flow, so the first nav item is
            * still clickable right to its top edge and nothing below moves.
            */}
          {festive && (
            <FestiveGarland compact={isCollapsed} className="pointer-events-none absolute inset-x-0 top-[4.5rem] z-10 h-7" />
          )}

          {/* ── Nav items ── */}
          <SidebarContent className={festive ? "gap-0 pt-7" : "gap-0 pt-2"}>
            <SidebarMenu className="px-2 py-1 gap-0.5">
              {(() => {
                const byPath = new Map(visibleMenuItems.map((item) => [item.path, item]));
                const entries = sidebarEntriesFor(new Set(byPath.keys()));
                /* The group holding the page you are on stays open, so the
                   sidebar never hides where you currently are. */
                const activeGroup = groupContaining(activeMenuItem?.path ?? "");

                const badgeFor = (count: number, isActive: boolean, label: string) => (
                  <span
                    className={`ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
                      isActive ? "bg-white text-primary" : "bg-destructive text-destructive-foreground"
                    }`}
                    aria-label={label}
                  >
                    {count > 99 ? "99+" : count}
                  </span>
                );

                const row = (item: NavItem) => {
                  const isActive =
                    location === item.path ||
                    (item.path !== "/" && location.startsWith(item.path));
                  const count = navBadges[item.path] ?? 0;
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => setLocation(item.path)}
                        tooltip={item.label}
                        // Hover motion lives in index.css next to the global
                        // button rule — see "Sidebar nav". A Tailwind transition
                        // utility cannot win against that rule.
                        className={`h-10 font-medium text-sm group/navitem ${item.className ?? ""}`}
                      >
                        <item.icon
                          className={`h-4 w-4 shrink-0 transition-colors ${
                            isActive ? "text-white" : "text-muted-foreground group-hover/navitem:text-primary"
                          }`}
                        />
                        <span className={isActive ? "font-semibold" : ""}>{item.label}</span>
                        {/* What is waiting for someone. Capped at 99 so a
                            backlog cannot stretch the sidebar, and hidden
                            entirely at zero — a badge showing "0" is noise that
                            trains people to ignore the badge that matters. */}
                        {count > 0 && badgeFor(count, isActive, `${count} waiting`)}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                };

                return entries.map((entry) => {
                  if (entry.kind === "item") {
                    const item = byPath.get(entry.path);
                    return item ? row(item) : null;
                  }
                  const children = entry.paths
                    .map((path) => byPath.get(path))
                    .filter((item): item is NavItem => Boolean(item));
                  if (children.length === 0) return null;

                  const open =
                    openGroups.has(entry.key) ||
                    hoveredGroup === entry.key ||
                    activeGroup === entry.key;
                  const GroupIcon = GROUP_ICON[entry.key];
                  /* Rolled up from the children while the group is shut.
                     Messages is inside Communication now, and a closed
                     group that swallows "three people are waiting" is a
                     worse sidebar than the flat one it replaced. */
                  const waiting = children.reduce((n, c) => n + (navBadges[c.path] ?? 0), 0);
                  const holdsActive = activeGroup === entry.key;

                  return (
                    <SidebarMenuItem
                      key={entry.key}
                      onMouseEnter={hoverOpens ? () => setHoveredGroup(entry.key) : undefined}
                      onMouseLeave={hoverOpens ? () => setHoveredGroup((current) => (current === entry.key ? null : current)) : undefined}
                    >
                      <SidebarMenuButton
                        onClick={() => toggleGroup(entry.key)}
                        tooltip={entry.label}
                        aria-expanded={open}
                        className="h-10 font-medium text-sm group/navitem"
                      >
                        <GroupIcon
                          className={`h-4 w-4 shrink-0 transition-colors ${
                            holdsActive ? "text-primary" : "text-muted-foreground group-hover/navitem:text-primary"
                          }`}
                        />
                        <span className={holdsActive ? "font-semibold" : ""}>{entry.label}</span>
                        {!open && waiting > 0 && badgeFor(waiting, false, `${waiting} waiting in ${entry.label}`)}
                        <ChevronDown
                          className={`${!open && waiting > 0 ? "ml-1" : "ml-auto"} h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                        />
                      </SidebarMenuButton>
                      {open && (
                        <SidebarMenuSub>
                          {children.map((child) => {
                            const isActive =
                              location === child.path || location.startsWith(child.path + "/");
                            const count = navBadges[child.path] ?? 0;
                            return (
                              <SidebarMenuSubItem key={child.path}>
                                <SidebarMenuSubButton
                                  isActive={isActive}
                                  onClick={() => setLocation(child.path)}
                                  className="h-9 cursor-pointer text-sm group/navsub"
                                >
                                  {/* No colour classes: index.css derives these
                                      from the runtime sidebar foreground so they
                                      stay readable on any brand colour. */}
                                  <child.icon className="h-4 w-4 shrink-0 transition-colors" />
                                  <span className={isActive ? "font-semibold" : ""}>{child.label}</span>
                                  {count > 0 && badgeFor(count, isActive, `${count} waiting`)}
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  );
                });
              })()}
            </SidebarMenu>
          </SidebarContent>

          {/* ── Powered by Groomigo ── */}
          {!isCollapsed && (
            <div className="px-3 py-3 flex items-center justify-center gap-2">
              <span className="text-[11px] text-muted-foreground/50 tracking-wide font-medium">Powered by</span>
              <img
                src="/groomigo_logo.png"
                alt="Go to dashboard"
                role="button"
                tabIndex={0}
                className="h-8 sm:h-9 md:h-10 w-auto object-contain cursor-pointer"
                style={{
                  opacity: 0,
                  animation: "groomigo-fadein 0.8s cubic-bezier(0.23,1,0.32,1) 0.4s forwards",
                  transition: "transform 200ms cubic-bezier(0.23,1,0.32,1), filter 200ms ease, opacity 200ms ease",
                }}
                onClick={() => setLocation("/")}
                onKeyDown={e => e.key === "Enter" && setLocation("/")}
                onMouseEnter={e => {
                  const el = e.currentTarget;
                  el.style.transform = "scale(1.08)";
                  el.style.filter = "brightness(1.08) drop-shadow(0 0 10px rgba(124,58,237,0.42))";
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget;
                  el.style.transform = "scale(1)";
                  el.style.filter = "";
                }}
              />
            </div>
          )}

        </Sidebar>

        {/* Resize handle */}
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => { if (!isCollapsed) setIsResizing(true); }}
          style={{ zIndex: 50 }}
        />
      </div>

      {/* Over everything, including dialogs, and clickable through. */}
      {snowing && <FestiveSnow />}

      <SidebarInset>
        {isMobile && (
          /*
            * The same three columns on a phone. The page title is dropped
            * from the middle rather than the search being tucked beside
            * it: on a 375px screen there is room for one thing in the
            * centre, and the sidebar already names the page you are on.
            */
          <div className="grid border-b h-14 grid-cols-[1fr_auto_1fr] items-center gap-1 bg-background/90 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40 shadow-sm">
            <div className="flex min-w-0 items-center gap-1 justify-start">
              <SidebarTrigger
                className="h-9 w-9 rounded-lg bg-background hover:bg-accent transition-colors"
                aria-label="Toggle menu"
              />
              <SalonSwitcher />
            </div>
            <div className="flex min-w-0 justify-center">
              <GlobalSearch />
            </div>
            <div className="flex justify-end">{accountControls}</div>
          </div>
        )}
        {!isMobile && (
          /*
            * Andy, 03/11/2026: "Make the main search feature in the centre
            * of the page both on browser and phone versions."
            *
            * A three-column grid, not `justify-between` with a spacer: the
            * search has to sit at the MIDDLE OF THE PAGE, and with
            * flex-between it would centre itself in whatever gap the
            * account controls left over - drifting left as the signed-in
            * name gets longer. The outer columns are 1fr each, so the
            * middle one is the true centre whatever is in them.
            */
          <div className="sticky top-0 z-40 grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border/80 bg-card/75 px-4 backdrop-blur">
            {/* The left column was empty. A salon switcher belongs here:
                which business you are looking at is the first thing to
                establish, and it must not push the search off centre —
                this column is 1fr, so it cannot. Renders nothing at all
                for a single-salon account. */}
            <div className="flex min-w-0 justify-start"><SalonSwitcher /></div>
            <GlobalSearch />
            <div className="flex justify-end">{accountControls}</div>
          </div>
        )}
        {/* Below the header in the DOM so it reads as the header's own edge,
            and sticky at the header's height so the board scrolls beneath it
            rather than over the top of it. */}
        {festive && <div aria-hidden className="festive-stripe sticky top-14 z-40 h-1.5 shrink-0" />}
        <TrialBanner />
        <main className="flex-1 p-4 md:p-6 gm-fade">{children}</main>
      </SidebarInset>
      {/*
        * My profile.
        *
        * This was imported and `profileOpen` was being SET, and the
        * dialog was never rendered — so "My profile" in the account
        * menu did nothing, and the sidebar-hover setting that lives
        * inside it could not be reached at all. Exactly the shape of
        * 45253c5, where a router was defined in its own file and never
        * composed into appRouter: everything compiles, nothing runs.
        * Rendered here rather than inside the dropdown, so closing the
        * menu does not unmount the dialog with it.
        */}
      <MyProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}
