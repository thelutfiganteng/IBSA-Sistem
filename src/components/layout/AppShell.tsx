import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Scale,
  Boxes,
  Network,
  Sparkles,
  Brain,
  Truck,
  FileText,
  LogOut,
  Sun,
  Moon,
  Bell,
  MessageCircle,
  Menu,
  X,
  Radio,
  ShieldAlert,
  Globe2,
  Users,
  UserPlus,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/hooks/use-theme";
import { useAuthUser } from "@/hooks/use-auth";
import { logout, canAccess } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/seed";
import { ensureSeed, store } from "@/lib/storage";
import { ChatbotWidget } from "@/components/ChatbotWidget";

const ALL_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
  { to: "/timbangan", label: "Timbangan Digital", icon: Scale, key: "timbangan" },
  { to: "/komoditas", label: "Data Komoditas", icon: Boxes, key: "komoditas" },
  { to: "/price-intelligence", label: "Price Intelligence", icon: Radio, key: "price-intelligence" },
  { to: "/gis-map", label: "GIS Smart Food Map & Clustering", icon: Globe2, key: "gis-map" },
  { to: "/ai-center", label: "AI Command Center", icon: Brain, key: "ai-center" },
  { to: "/distribusi", label: "Distribusi Supply", icon: Truck, key: "distribusi" },
  { to: "/petugas", label: "Direktori & Registrasi Petugas", icon: Users, key: "petugas" },
  { to: "/aktivitas-petugas", label: "Log Aktivitas Petugas", icon: Activity, key: "aktivitas-petugas" },
  { to: "/laporan", label: "Laporan", icon: FileText, key: "laporan" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { user, mounted } = useAuthUser();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (mounted) {
      ensureSeed().then(() => {
        setReady(true);
      });
      if (!user) {
        navigate({ to: "/login" });
      } else if (user.role === "pasar" && path !== "/timbangan") {
        navigate({ to: "/timbangan" });
      }
    }
  }, [mounted, user, navigate, path]);

  if (!mounted || !user || !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Memuat Data Supabase…
      </div>
    );
  }

  const nav = ALL_NAV.filter((n) => canAccess(user.role, n.key));
  const auditCount = store.audit.get().length;

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — sticky on desktop, drawer on mobile; never scrolls with content */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-72 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:sticky lg:top-0 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold shadow-md">
            S
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold leading-tight">Smart Food Sumsel</div>
            <div className="text-xs text-sidebar-foreground/60">Supply Monitoring</div>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {nav.map((n) => {
            const active = path === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="shrink-0 border-t border-sidebar-border p-4">
          <div className="mb-3 rounded-lg bg-sidebar-accent/40 p-3">
            <div className="text-xs text-sidebar-foreground/60">Login sebagai</div>
            <div className="text-sm font-medium">{user.name}</div>
            <Badge className="mt-1 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary">
              {ROLE_LABEL[user.role]}
            </Badge>
          </div>
          <Button
            variant="outline"
            className="w-full border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md lg:px-8">
          <button className="lg:hidden" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <div className="text-sm text-muted-foreground">Smart Government / Sumsel</div>
            <h1 className="text-lg font-semibold">
              {ALL_NAV.find((n) => n.to === path)?.label ?? "Dashboard"}
            </h1>
          </div>
          <Button variant="ghost" size="icon" onClick={toggle} title="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="relative" title="Audit log">
            <Bell className="h-4 w-4" />
            {auditCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-deficit px-1 text-[10px] font-bold text-white">
                {auditCount > 99 ? "99+" : auditCount}
              </span>
            )}
          </Button>
          <Button onClick={() => setChatOpen(true)} className="hidden md:inline-flex">
            <MessageCircle className="mr-2 h-4 w-4" /> AI Asisten
          </Button>
        </header>
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
      <ChatbotWidget open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
