import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { getSessionContext } from "@/lib/session.functions";
import { getPostLoginPath } from "@/lib/route-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Stethoscope } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

export const Route = createFileRoute("/aceitar-convite")({
  head: () => ({
    meta: [{ title: `Aceitar convite — ${APP_NAME}` }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const navigate = useNavigate();
  const sessionFn = useServerFn(getSessionContext);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setHasSession(!!data.user);
      if (data.user?.email) setEmail(data.user.email);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(!!session?.user);
      if (session?.user?.email) setEmail(session.user.email);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return toast.error("As senhas não conferem.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha definida com sucesso");
      const session = await sessionFn();
      navigate({ to: getPostLoginPath(session) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao definir senha");
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error instanceof Error ? result.error : new Error(String(result.error));
      if (result.redirected) return;
      const session = await sessionFn();
      navigate({ to: getPostLoginPath(session) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha com Google");
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
            <Stethoscope className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
        </div>

        <div className="rounded-2xl border bg-card p-8 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Bem-vindo ao {APP_NAME}</h1>
              <p className="text-sm text-muted-foreground">
                Defina sua senha para concluir o primeiro acesso.
              </p>
            </div>
          </div>

          {hasSession === false && (
            <p className="mt-6 text-sm text-destructive">
              Link de convite inválido ou expirado. Solicite um novo convite ao administrador.
            </p>
          )}

          {hasSession && (
            <>
              <form onSubmit={onSubmit} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={email} readOnly disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw">Nova senha</Label>
                  <Input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw2">Confirmar senha</Label>
                  <Input id="pw2" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Definir senha e entrar
                </Button>
              </form>

              <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                ou
                <div className="h-px flex-1 bg-border" />
              </div>

              <Button type="button" variant="outline" className="w-full" disabled={googleLoading} onClick={onGoogle}>
                {googleLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
                  </svg>
                )}
                Continuar com Google (mesmo email)
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
