import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listClinics, createClinicWithAdmin, updateClinic, deleteClinic,
} from "@/lib/clinics.functions";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useEffect } from "react";
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Plus, Loader2, ShieldCheck, MoreHorizontal, Trash2, Power, CalendarDays, LogOut,
} from "lucide-react";

export const Route = createFileRoute("/master-admin")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Master Admin — ClinicaSaaS" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: SuperAdminPage,
});

function SuperAdminPage() {
  const navigate = useNavigate();
  const { data: session, isLoading } = useSession();
  const qc = useQueryClient();
  const listFn = useServerFn(listClinics);
  const updateFn = useServerFn(updateClinic);
  const deleteFn = useServerFn(deleteClinic);

  useEffect(() => {
    if (session && session.role !== "super_admin") {
      navigate({ to: "/dashboard" });
    }
  }, [session, navigate]);

  const { data: clinics, isLoading: loadingList } = useQuery({
    queryKey: ["clinics"], queryFn: () => listFn(),
    enabled: session?.role === "super_admin",
  });

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

  async function logout() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  if (isLoading || !session) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando…</div>;
  if (session.role !== "super_admin") return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b bg-card flex items-center px-6 gap-3">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <span className="font-semibold tracking-tight">Super Admin</span>
        <span className="text-sm text-muted-foreground">— Painel global</span>
        <div className="ml-auto flex items-center gap-3">
          <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">Voltar ao app</Link>
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4" /> Sair</Button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Clínicas</h1>
            <p className="text-sm text-muted-foreground">Gerencie contas, status e vencimentos.</p>
          </div>
          <NewClinicDialog onDone={() => qc.invalidateQueries({ queryKey: ["clinics"] })} />
        </div>

        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clínica</TableHead>
                <TableHead>Admin(s)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingList && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>}
              {!loadingList && (clinics ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma clínica cadastrada.</TableCell></TableRow>
              )}
              {(clinics ?? []).map((c) => {
                const expired = c.expiration_date && new Date(c.expiration_date) < new Date();
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.admins.join(", ") || "—"}</TableCell>
                    <TableCell>
                      {c.status === "ativo" ? (
                        <Badge className="bg-success/15 text-success border-0">Ativo</Badge>
                      ) : (
                        <Badge className="bg-destructive/15 text-destructive border-0">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className={expired ? "text-destructive" : ""}>
                      {c.expiration_date ? new Date(c.expiration_date).toLocaleDateString("pt-BR") : "—"}
                      {expired && <span className="ml-1 text-xs">(vencida)</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{new Date(c.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => updMut.mutate({ id: c.id, status: c.status === "ativo" ? "inativo" : "ativo" })}>
                            <Power className="h-4 w-4" /> {c.status === "ativo" ? "Desativar" : "Ativar"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            const d = new Date(); d.setDate(d.getDate() + 30);
                            updMut.mutate({ id: c.id, expirationDate: d.toISOString(), status: "ativo" });
                          }}>
                            <CalendarDays className="h-4 w-4" /> Renovar +30 dias
                          </DropdownMenuItem>
                          <EditExpirationItem
                            current={c.expiration_date}
                            onSave={(iso) => updMut.mutate({ id: c.id, expirationDate: iso })}
                          />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => { if (confirm(`Remover clínica "${c.name}" e todos os usuários?`)) delMut.mutate(c.id); }}
                          >
                            <Trash2 className="h-4 w-4" /> Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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

function EditExpirationItem({ current, onSave }: { current: string | null; onSave: (iso: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ? current.slice(0, 10) : "");
  return (
    <>
      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }}>
        <CalendarDays className="h-4 w-4" /> Definir vencimento…
      </DropdownMenuItem>
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

function NewClinicDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const fn = useServerFn(createClinicWithAdmin);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
          name, adminEmail: email, adminPassword: password,
          expirationDate: expiration ? new Date(expiration + "T23:59:59").toISOString() : null,
          status,
        },
      });
      toast.success("Clínica criada");
      setOpen(false); setName(""); setEmail(""); setPassword("");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
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
          <DialogDescription>Cria a clínica e o login do Admin responsável.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label>Nome da clínica</Label><Input required value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Email do admin</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-2"><Label>Senha (mín. 8)</Label><Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Vencimento</Label><Input type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Status inicial</Label>
              <select value={status} onChange={(e) => setStatus(e.target.value as "ativo" | "inativo")} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
          </div>
          <DialogFooter><Button type="submit" disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />} Criar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
