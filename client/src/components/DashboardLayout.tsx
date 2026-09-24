import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import NotificationBell from "@/components/NotificationBell";
import IncomingCallAlert from "@/components/IncomingCallAlert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import {
  CalendarDays,
  Workflow,
  CreditCard,
  Users,
  BarChart3,
  UserCog,
  DollarSign,
  MessageSquare,
  Mail,
  FileBarChart2,
  LogOut,
  PanelLeft,
  Scissors,
  ImagePlus,
  ImageOff,
  Palette,
  Settings,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { trpc } from "@/lib/trpc";
import { StaffAvatar } from "@/components/StaffAvatar";
import { toast } from "sonner";

const menuItems = [
  { icon: CalendarDays,   label: "Appointments",     path: "/calendar" },
  { icon: Workflow,       label: "Workflow",          path: "/workflow" },
  { icon: DollarSign,     label: "Pricing & Services", path: "/pricing" },
  { icon: CreditCard,     label: "Memberships",       path: "/memberships" },
  { icon: Users,          label: "Clients",           path: "/clients" },
  { icon: BarChart3,      label: "Analytics",         path: "/analytics" },
  { icon: UserCog,        label: "Staff",             path: "/staff" },
  { icon: MessageSquare,  label: "Messages",          path: "/messages" },
  { icon: Mail,           label: "Email Campaigns",   path: "/email-campaigns" },
  { icon: FileBarChart2,  label: "Reporting",         path: "/reporting" },
];

const staffOperationMenuItems = menuItems.filter((item) => ["/calendar", "/workflow", "/memberships"].includes(item.path));


/** Perceived luminance 0–1 for a #rrggbb hex colour. */
function luma(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length !== 6) return 0.5;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Set sidebar CSS custom properties so foreground colours are always readable. */
function applySidebarColor(hex: string, root: HTMLElement) {
  root.style.setProperty("--brand-sidebar", hex);
  root.style.setProperty("--color-sidebar", hex);
  const dark = luma(hex) < 0.45;
  if (dark) {
    root.style.setProperty("--color-sidebar-foreground",        "rgba(255,255,255,0.90)");
    root.style.setProperty("--color-sidebar-accent",            "rgba(255,255,255,0.09)");
    root.style.setProperty("--color-sidebar-accent-foreground", "rgba(255,255,255,0.92)");
    root.style.setProperty("--color-sidebar-border",            "rgba(255,255,255,0.10)");
  } else {
    root.style.setProperty("--color-sidebar-foreground",        "oklch(0.30 0.04 288)");
    root.style.setProperty("--color-sidebar-accent",            "oklch(0.955 0.022 292)");
    root.style.setProperty("--color-sidebar-accent-foreground", "oklch(0.42 0.16 292)");
    root.style.setProperty("--color-sidebar-border",            "oklch(0.935 0.012 292)");
  }
}

/** Quick brand-colour editor rendered in a Dialog. */
function BrandColoursDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const utils = trpc.useUtils();
  const { data: tenant } = trpc.settings.getTenantInfo.useQuery({ tenantId: 1 });
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
      utils.settings.getTenantInfo.invalidate({ tenantId: 1 });
      toast.success("Brand colours saved");
      onOpenChange(false);
    },
    onError: () => toast.error("Could not save colours"),
  });

  const preview = (next: typeof colors) => {
    const root = document.documentElement;
    root.style.setProperty("--brand-primary",        next.primary);
    root.style.setProperty("--brand-primary-strong", next.primary);
    applySidebarColor(next.sidebar, root);
  };

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
            onClick={() => save.mutate({ tenantId: 1, brandPrimary: colors.primary, brandAccent: colors.accent, brandSidebar: colors.sidebar })}
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

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    if (loading || typeof window === "undefined") return;
    if (!user) {
      if (window.location.pathname !== "/login") window.location.href = "/login";
      return;
    }
    const isStaffOperationRoute = ["/calendar", "/workflow", "/memberships"].includes(window.location.pathname);
    if (user.role === "staff" && !isStaffOperationRoute) {
      window.location.href = "/calendar";
    }
  }, [loading, user]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return <DashboardLayoutSkeleton />;
  }

  if (user.role === "staff" && !["/calendar", "/workflow", "/memberships"].includes(window.location.pathname)) {
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
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { data: tenantBranding } = trpc.settings.getTenantInfo.useQuery({ tenantId: 1 });
  // The signed-in user's own staff record, so they can set their own profile
  // photo from here. Returns null for accounts with no staff row, in which case
  // the control is simply not offered.
  const { data: myStaff, refetch: refetchMyStaff } = trpc.staff.getMyProfile.useQuery();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const updateMyPhoto = trpc.staff.updateMyPhoto.useMutation({
    onSuccess: () => { toast.success("Profile photo updated"); refetchMyStaff(); },
    onError: (e) => toast.error(e.message),
  });

  async function uploadMyPhoto(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("Image too large (max 8 MB)"); return; }
    setPhotoUploading(true);
    try {
      const res = await fetch("/api/upload/staff-photo", { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Upload failed");
      updateMyPhoto.mutate({ photoUrl: data.url });
    } catch (err: any) {
      toast.error(err?.message ?? "Could not upload the photo");
    } finally {
      setPhotoUploading(false);
    }
  }

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const apply = (name: string, value: string | null | undefined) => { if (value) root.style.setProperty(name, value); };
    apply("--brand-primary", tenantBranding?.brandPrimary);
    apply("--brand-accent",  tenantBranding?.brandAccent);
    applySidebarColor(tenantBranding?.brandSidebar ?? "#1e1229", root);
    return () => {
      root.style.removeProperty("--brand-primary");
      root.style.removeProperty("--brand-accent");
      root.style.removeProperty("--brand-sidebar");
      root.style.removeProperty("--color-sidebar");
      root.style.removeProperty("--color-sidebar-foreground");
      root.style.removeProperty("--color-sidebar-accent");
      root.style.removeProperty("--color-sidebar-accent-foreground");
      root.style.removeProperty("--color-sidebar-border");
    };
  }, [tenantBranding]);

  const activeMenuItem = menuItems.find(
    (item) => location === item.path || location.startsWith(item.path + "/")
  );
  const visibleMenuItems = user?.role === "staff" ? staffOperationMenuItems : menuItems;

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
              <NotificationBell />
              <IncomingCallAlert />
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

          {/* ── Nav items ── */}
          <SidebarContent className="gap-0 pt-2">
            <SidebarMenu className="px-2 py-1 gap-0.5">
              {visibleMenuItems.map((item) => {
                const isActive =
                  location === item.path ||
                  (item.path !== "/" && location.startsWith(item.path));
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="h-10 font-medium text-sm group/navitem"
                    >
                      <item.icon
                        className={`h-4 w-4 shrink-0 transition-colors ${
                          isActive ? "text-white" : "text-muted-foreground group-hover/navitem:text-primary"
                        }`}
                      />
                      <span className={isActive ? "font-semibold" : ""}>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
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

          {/* ── Footer / user ── */}
          <SidebarFooter className="p-3 border-t border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <StaffAvatar
                    photoUrl={myStaff?.photoUrl}
                    name={myStaff?.name ?? user?.name}
                    colourHex={myStaff?.colourHex}
                    className="h-8 w-8"
                  />
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate leading-none" style={{ color: "var(--color-sidebar-foreground)" }}>{user?.name || "-"}</p>
                      <p className="text-xs truncate mt-1" style={{ color: "color-mix(in srgb, var(--color-sidebar-foreground) 65%, transparent)" }}>{user?.email || "-"}</p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {myStaff && (
                  <DropdownMenuItem
                    className="cursor-pointer"
                    disabled={photoUploading || updateMyPhoto.isPending}
                    onSelect={(e) => { e.preventDefault(); photoInputRef.current?.click(); }}
                  >
                    <ImagePlus className="mr-2 h-4 w-4" />
                    <span>{photoUploading ? "Uploading…" : myStaff.photoUrl ? "Change my photo" : "Add my photo"}</span>
                  </DropdownMenuItem>
                )}
                {myStaff?.photoUrl && (
                  <DropdownMenuItem
                    className="cursor-pointer"
                    disabled={updateMyPhoto.isPending}
                    onSelect={(e) => { e.preventDefault(); updateMyPhoto.mutate({ photoUrl: null }); }}
                  >
                    <ImageOff className="mr-2 h-4 w-4" />
                    <span>Remove my photo</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={() => setBrandDialogOpen(true)}
                >
                  <Palette className="mr-2 h-4 w-4" />
                  <span>Brand colours</span>
                </DropdownMenuItem>
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
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMyPhoto(f); e.currentTarget.value = ""; }}
            />
            <BrandColoursDialog open={brandDialogOpen} onOpenChange={setBrandDialogOpen} />
          </SidebarFooter>
        </Sidebar>

        {/* Resize handle */}
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => { if (!isCollapsed) setIsResizing(true); }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/90 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40 shadow-sm">
            <div className="flex items-center gap-2">
              <SidebarTrigger
                className="h-9 w-9 rounded-lg bg-background hover:bg-accent transition-colors"
                aria-label="Toggle menu"
              />
              <span className="tracking-tight text-foreground text-sm font-medium">
                {activeMenuItem?.label ?? "Groomigo"}
              </span>
            </div>
            <img
              src="/groomigo_logo.png"
              alt="Groomigo — go to dashboard"
              role="button"
              tabIndex={0}
              className="h-7 w-auto object-contain cursor-pointer mr-2"
              style={{ transition: "filter 200ms ease, transform 200ms ease" }}
              onClick={() => setLocation("/")}
              onKeyDown={e => e.key === "Enter" && setLocation("/")}
              onMouseEnter={e => {
                e.currentTarget.style.filter = "drop-shadow(0 0 8px rgba(124,58,237,0.45))";
                e.currentTarget.style.transform = "scale(1.06)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.filter = "";
                e.currentTarget.style.transform = "scale(1)";
              }}
            />
          </div>
        )}
        <main className="flex-1 p-4 md:p-6 gm-fade">{children}</main>
      </SidebarInset>
    </>
  );
}
