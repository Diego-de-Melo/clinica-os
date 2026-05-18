import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  bootstrapSuperAdmin,
  isSuperAdminConfigured,
} from "@/lib/bootstrap.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/setup")({
  head: () => ({ meta: [{ title: "Setup — ClinicaSaaS" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: SetupPage,
});

function SetupPage() {
  const navigate = useNavigate();
  const checkFn = useServerFn(isSuperAdminConfigured);
  const createFn = useServerFn(bootstrapSuperAdmin);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("mdmstor@gmail.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkFn()
      .then((r) => {
        if (r.configured) {
          toast.info("Super Admin já configurado");
          navigate({ to: "/login" });
        }
      })
      .finally(() => setChecking(false));
  }, [checkFn, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await createFn({ data: { email, password } });
      toast.success("Super Admin criado! Faça login.");
      navigate({ to: "/login" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Verificando…</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground grid place-items-center">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Criar Super Admin</h1>
            <p className="text-sm text-muted-foreground">
              Configuração inicial do dono do SaaS.
            </p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha (mín. 8)</Label>
            <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />} Criar Super Admin
          </Button>
        </form>
      </div>
    </div>
  );
}
