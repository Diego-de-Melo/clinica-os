import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { APP_NAME, buildActivationMailto } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Mail, LogOut } from "lucide-react";

export const Route = createFileRoute("/bloqueio")({
  head: () => ({
    meta: [
      { title: `Conta bloqueada — ${APP_NAME}` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BloqueioPage,
});

function BloqueioPage() {
  const navigate = useNavigate();
  const { data: session, isLoading } = useSession();

  // se de repente estiver liberado, manda pro dashboard
  useEffect(() => {
    if (session && !session.isBlocked) {
      navigate({ to: session.role === "super_admin" ? "/master-admin" : "/dashboard" });
    }
  }, [session, navigate]);

  if (isLoading || !session) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  const link = buildActivationMailto(session.email);
  const expired = session.expirationDate
    ? new Date(session.expirationDate).getTime() < Date.now()
    : false;

  async function logout() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-xl border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-warning/15 text-warning grid place-items-center">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {expired ? "Assinatura vencida" : "Conta inativa"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Sua conta precisa ser ativada ou sua assinatura venceu.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-lg bg-muted/60 p-4 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{session.email}</span>
          </div>
          {session.clinicName && (
            <div className="flex justify-between gap-3 mt-1">
              <span className="text-muted-foreground">Clínica</span>
              <span className="font-medium">{session.clinicName}</span>
            </div>
          )}
          {session.expirationDate && (
            <div className="flex justify-between gap-3 mt-1">
              <span className="text-muted-foreground">Vencimento</span>
              <span className="font-medium">
                {new Date(session.expirationDate).toLocaleDateString("pt-BR")}
              </span>
            </div>
          )}
        </div>

        {link ? (
          <a href={link} className="mt-6 block">
            <Button size="lg" className="w-full">
              <Mail className="h-5 w-5" />
              Solicitar ativação por e-mail
            </Button>
          </a>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            Esta conta será liberada pelo administrador desta instância. Entre em contato com ele
            para ativar seu acesso.
          </p>
        )}

        <button
          onClick={logout}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>
    </div>
  );
}
