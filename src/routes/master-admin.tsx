import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  classifyClinic,
  countClinicsByLifecycle,
  filterClinics,
  type ClinicLifecycle,
} from "@/lib/clinic-utils";
import {
  listClinics, createClinicWithAdmin, updateClinic, deleteClinic, resendClinicAdminInvite,
} from "@/lib/clinics.functions";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { APP_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { ActionCell, DirectToggle, InlineAction } from "@/components/row-actions";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  ShieldCheck,
  Trash2,
  CalendarDays,
  LogOut,
  Search,
  Building2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Pencil,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/master-admin")({
  head: () => ({
    meta: [{ title: `Master Admin — ${APP_NAME}` }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: SuperAdminPage,
});

function SuperAdminPage() {
  const navigate = useNavigate();
  const { data: session, isLoading } = useSession();
  const qc = useQueryClient();
  const listFn = useServerFn(listClinics);
  const updateFn = useServerFn(updateClinic);
  const deleteFn = useServerFn(deleteClinic);
  const resendFn = useServerFn(resendClinicAdminInvite);

  const [search, setSearch] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<ClinicLifecycle | "all">("all");

  const { data: clinics, isLoading: loadingList } = useQuery({
    queryKey: ["clinics"],
    queryFn: () => listFn(),
    enabled: session?.role === "super_admin",
  });

  const allClinics = clinics ?? [];
  const counts = useMemo(() => countClinicsByLifecycle(allClinics), [allClinics]);
  const filteredClinics = useMemo(
    () => filterClinics(allClinics, { search, lifecycle: lifecycleFilter }),
    [allClinics, search, lifecycleFilter],
  );

  const updMut = useMutation({
    mutationFn: (input: { id: string; status?: "ativo" | "inativo"; expirationDate?: string | null; name?: string }) =>
      updateFn({ data: input }),
    onSuccess: () => { toast.success("Clínica atualizada"); qc.invalidateQueries({ queryKey: ["clinics"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Clínica removida"); qc.invalidateQueries({ queryKey: ["clinics"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const resendMut = useMutation({
    mutationFn: (clinicId: string) =>
      resendFn({ data: { clinicId, redirectTo: `${window.location.origin}/aceitar-convite` } }),
    onSuccess: (r) => toast.success(`Convite reenviado para ${r.email}`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  async function logout() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  useEffect(() => {
    if (!isLoading && (!session || session.role !== "super_admin")) {
      navigate({ to: "/login" });
    }
  }, [isLoading, session, navigate]);

  if (isLoading) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!session || session.role !== "super_admin") return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b bg-card flex items-center px-6 gap-3">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <span className="font-semibold tracking-tight">Master Admin</span>
        <span className="text-sm text-muted-foreground">— {APP_NAME}</span>
        <div className="ml-auto flex items-center gap-3">
          <Link to="/master-admin/logs">
            <Button variant="ghost" size="sm">Logs</Button>
          </Link>
          <span className="text-xs text-muted-foreground hidden sm:inline">{session.email}</span>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Painel global de clientes</h1>
            <p className="text-sm text-muted-foreground">
              Visão operacional das clínicas — sem acesso a dados clínicos (LGPD).
            </p>
          </div>
          <NewClinicDialog onDone={() => qc.invalidateQueries({ queryKey: ["clinics"] })} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Total de clientes"
            value={allClinics.length}
            icon={Building2}
            active={lifecycleFilter === "all"}
            onClick={() => setLifecycleFilter("all")}
          />
          <KpiCard
            label="Ativas"
            value={counts.ativa}
            icon={CheckCircle2}
            accent="success"
            active={lifecycleFilter === "ativa"}
            onClick={() => setLifecycleFilter("ativa")}
          />
          <KpiCard
            label="Inativas"
            value={counts.inativa}
            icon={XCircle}
            accent="muted"
            active={lifecycleFilter === "inativa"}
            onClick={() => setLifecycleFilter("inativa")}
          />
          <KpiCard
            label="Vencidas"
            value={counts.vencida}
            icon={AlertTriangle}
            accent="destructive"
            active={lifecycleFilter === "vencida"}
            onClick={() => setLifecycleFilter("vencida")}
          />
        </div>

        <div className="rounded-xl border bg-card">
          <div className="p-3 border-b flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome da clínica ou email do admin…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {lifecycleFilter !== "all" && (
              <Button variant="outline" size="sm" onClick={() => setLifecycleFilter("all")}>
                Limpar filtro
              </Button>
            )}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clínica</TableHead>
                <TableHead>Admin(s)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead className="text-right min-w-[280px]">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingList && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>}
              {!loadingList && allClinics.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma clínica cadastrada.</TableCell></TableRow>
              )}
              {!loadingList && allClinics.length > 0 && filteredClinics.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum cliente encontrado para esta busca ou filtro.</TableCell></TableRow>
              )}
              {filteredClinics.map((c) => {
                const lifecycle = classifyClinic(c);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.admins.join(", ") || "—"}</TableCell>
                    <TableCell>
                      <LifecycleBadge lifecycle={lifecycle} />
                    </TableCell>
                    <TableCell className={lifecycle === "vencida" ? "text-destructive" : ""}>
                      {c.expiration_date ? new Date(c.expiration_date).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{new Date(c.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="text-right">
                      <ActionCell>
                        <DirectToggle
                          checked={c.status === "ativo"}
                          labelOn="Ativo"
                          labelOff="Inativo"
                          disabled={updMut.isPending}
                          onCheckedChange={(v) =>
                            updMut.mutate({ id: c.id, status: v ? "ativo" : "inativo" })
                          }
                        />
                        <span className="text-border mx-0.5 hidden sm:inline">|</span>
                        <InlineAction
                          label="+30 dias"
                          icon={RefreshCw}
                          disabled={updMut.isPending}
                          onClick={() => {
                            const now = Date.now();
                            const current = c.expiration_date ? new Date(c.expiration_date).getTime() : 0;
                            const base = new Date(Math.max(now, current));
                            base.setDate(base.getDate() + 30);
                            updMut.mutate({ id: c.id, expirationDate: base.toISOString(), status: "ativo" });
                          }}
                        />
                        <EditExpirationButton
                          current={c.expiration_date}
                          onSave={(iso) => updMut.mutate({ id: c.id, expirationDate: iso })}
                        />
                        <EditClinicButton
                          clinic={c}
                          onSave={(patch) => updMut.mutate({ id: c.id, ...patch })}
                        />
                        {c.admins.length > 0 && (
                          <InlineAction
                            label="Reenviar convite"
                            icon={Mail}
                            disabled={resendMut.isPending}
                            onClick={() => resendMut.mutate(c.id)}
                          />
                        )}
                        <InlineAction
                          label="Remover"
                          icon={Trash2}
                          variant="destructive"
                          disabled={delMut.isPending}
                          onClick={() => {
                            if (confirm(`Remover clínica "${c.name}" e todos os usuários?`)) {
                              delMut.mutate(c.id);
                            }
                          }}
                        />
                      </ActionCell>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "success" | "destructive" | "muted";
  active?: boolean;
  onClick: () => void;
}) {
  const accentClass =
    accent === "success"
      ? "text-success"
      : accent === "destructive"
        ? "text-destructive"
        : "text-primary";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40",
        active && "ring-2 ring-primary border-primary",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className={cn("h-4 w-4", accentClass)} />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </button>
  );
}

function LifecycleBadge({ lifecycle }: { lifecycle: ClinicLifecycle }) {
  if (lifecycle === "vencida") {
    return <Badge className="bg-destructive/15 text-destructive border-0">Vencida</Badge>;
  }
  if (lifecycle === "ativa") {
    return <Badge className="bg-success/15 text-success border-0">Ativa</Badge>;
  }
  return <Badge className="bg-slate-200 text-slate-700 border-0">Inativa</Badge>;
}

function EditExpirationButton({ current, onSave }: { current: string | null; onSave: (iso: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ? current.slice(0, 10) : "");
  return (
    <>
      <InlineAction label="Vencimento" icon={CalendarDays} onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Definir vencimento</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Data</Label>
            <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={() => { if (value) { onSave(new Date(value + "T23:59:59").toISOString()); setOpen(false); } }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type ClinicRow = {
  id: string;
  name: string;
  status: string;
  expiration_date: string | null;
};

function EditClinicButton({
  clinic,
  onSave,
}: {
  clinic: ClinicRow;
  onSave: (patch: { name?: string; status?: "ativo" | "inativo"; expirationDate?: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(clinic.name);
  const [status, setStatus] = useState<"ativo" | "inativo">(clinic.status === "ativo" ? "ativo" : "inativo");
  const [expiration, setExpiration] = useState(clinic.expiration_date ? clinic.expiration_date.slice(0, 10) : "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      name,
      status,
      expirationDate: expiration ? new Date(expiration + "T23:59:59").toISOString() : null,
    });
    setOpen(false);
  }

  return (
    <>
      <InlineAction label="Editar" icon={Pencil} onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar clínica</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "ativo" | "inativo")}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Vencimento</Label>
                <Input type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NewClinicDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const fn = useServerFn(createClinicWithAdmin);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [expiration, setExpiration] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [status, setStatus] = useState<"ativo" | "inativo">("ativo");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fn({
        data: {
          name,
          adminEmail: email,
          expirationDate: expiration ? new Date(expiration + "T23:59:59").toISOString() : null,
          status,
          redirectTo: `${window.location.origin}/aceitar-convite`,
        },
      });
      toast.success(`Convite enviado para ${email}`);
      setOpen(false); setName(""); setEmail("");
      onDone();
    } catch (err) {
      console.error("[clinic] create failed", err);
      toast.error("Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Nova clínica</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova clínica</DialogTitle>
          <DialogDescription>
            Enviamos um convite seguro por email. O admin define a própria senha no primeiro acesso e pode também entrar com Google.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label>Nome da clínica</Label><Input required value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-2"><Label>Email do admin</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Vencimento</Label><Input type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Status inicial</Label>
              <select value={status} onChange={(e) => setStatus(e.target.value as "ativo" | "inativo")} className="h-10 w-full rounded-xl border bg-card px-3 text-sm">
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar convite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
