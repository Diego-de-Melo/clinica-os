import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { requireAppSession } from "@/lib/route-auth";
import { APP_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  Stethoscope,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const session = await requireAppSession();
    return { session };
  },
  component: AppLayout,
});

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  contador: "Contador",
  usuario: "Usuário",
  user: "Usuário",
  super_admin: "Super Admin",
};

function AppLayout() {
  const navigate = useNavigate();
  const { session: routeSession } = Route.useRouteContext();
  const { data: liveSession, isLoading } = useSession();
  const session = liveSession ?? routeSession;
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (isLoading && !session) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!session) return null;

  async function logout() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  const isAdmin = session.role === "admin";

  const navItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "Pacientes", url: "/pacientes", icon: Users },
    ...(isAdmin ? [{ title: "Equipe", url: "/equipe", icon: Settings }] : []),
    ...(isAdmin ? [{ title: "Backups", url: "/backups", icon: Database }] : []),
  ];

  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");

  const initial = (session.email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen flex w-full bg-background">
      <aside className="hidden md:flex w-[280px] shrink-0 flex-col border-r bg-sidebar sticky top-0 h-screen">
        <div className="px-5 py-5 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground grid place-items-center shrink-0">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight truncate">{APP_NAME}</div>
            <div className="text-xs text-muted-foreground truncate">
              {session.clinicName ?? "—"}
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-3 py-2">
            Operação
          </div>
          {navItems.map((item) => {
            const active = isActive(item.url);
            return (
              <Link
                key={item.url}
                to={item.url}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-[#F1F5F9]",
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.title}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-3 space-y-2">
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="h-9 w-9 rounded-full bg-primary/10 text-primary grid place-items-center font-semibold text-sm shrink-0">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{session.email}</div>
              <div className="text-xs text-muted-foreground">{ROLE_LABELS[session.role] ?? session.role}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout} className="w-full justify-start text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b bg-card flex items-center px-6 gap-3 sticky top-0 z-10">
          <div className="text-sm text-muted-foreground truncate">{session.clinicName}</div>
          <div className="ml-auto text-xs text-muted-foreground">
            {session.expirationDate &&
              `Vence em ${new Date(session.expirationDate).toLocaleDateString("pt-BR")}`}
          </div>
        </header>
        <main className="flex-1 p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
