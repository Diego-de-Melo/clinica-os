import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { requireAppSession } from "@/lib/route-auth";
import { APP_NAME } from "@/lib/constants";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  Stethoscope,
} from "lucide-react";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const session = await requireAppSession();
    return { session };
  },
  component: AppLayout,
});

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
  ];

  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarHeader className="px-3 py-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground grid place-items-center shrink-0">
                <Stethoscope className="h-4 w-4" />
              </div>
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <div className="text-sm font-semibold tracking-tight truncate">{APP_NAME}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {session.clinicName ?? "—"}
                </div>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Operação</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                        <Link to={item.url} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="p-3">
            <div className="text-xs text-muted-foreground truncate group-data-[collapsible=icon]:hidden">
              {session.email}
            </div>
            <Button variant="ghost" size="sm" onClick={logout} className="justify-start">
              <LogOut className="h-4 w-4" />
              <span className="group-data-[collapsible=icon]:hidden">Sair</span>
            </Button>
          </SidebarFooter>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b bg-card/50 flex items-center px-4 gap-3 sticky top-0 z-10 backdrop-blur">
            <SidebarTrigger />
            <div className="text-sm text-muted-foreground">{session.clinicName}</div>
            <div className="ml-auto text-xs text-muted-foreground">
              {session.expirationDate &&
                `Vence em ${new Date(session.expirationDate).toLocaleDateString("pt-BR")}`}
            </div>
          </header>
          <main className="flex-1 p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
