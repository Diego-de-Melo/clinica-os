import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { getSessionContext } from "@/lib/session.functions";
import { getPostLoginPath } from "@/lib/route-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, MessageCircle, Stethoscope } from "lucide-react";
import { APP_NAME, WHATSAPP_SUPPORT_NUMBER } from "@/lib/constants";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: `Login — ${APP_NAME}` }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const sessionFn = useServerFn(getSessionContext);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const session = await sessionFn();
      toast.success("Login efetuado");
      navigate({ to: getPostLoginPath(session) });
    } catch (err) {
      console.error("[auth] login failed", err);
      toast.error("Falha ao entrar");
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
      console.error("[auth] google login failed", err);
      toast.error("Falha ao entrar com Google");
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
          <h1 className="text-xl font-bold tracking-tight">Acessar conta</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Entre com seu email e senha cadastrados.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Entrar
            </Button>
            <button
              type="button"
              className="w-full text-xs text-muted-foreground hover:text-foreground text-center"
              onClick={async () => {
                if (!email) return toast.error("Digite seu email primeiro");
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/aceitar-convite`,
                });
                if (error) {
                  console.error("[auth] password reset failed", error);
                  toast.error("Não foi possível enviar o link de recuperação");
                }
                else toast.success("Enviamos um link de recuperação para o seu email");
              }}
            >
              Esqueci minha senha
            </button>
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
            Continuar com Google
          </Button>

          <a
            href={`https://wa.me/${WHATSAPP_SUPPORT_NUMBER}?text=${encodeURIComponent(`Olá, gostaria de criar uma conta no ${APP_NAME}.`)}`}
            target="_blank"
            rel="noreferrer"
            className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <MessageCircle className="h-3.5 w-3.5" /> Quero criar uma conta
          </a>
        </div>
      </div>
    </div>
  );
}
