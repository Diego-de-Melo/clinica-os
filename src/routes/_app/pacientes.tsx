import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import Papa from "papaparse";
import {
  listPatients, createPatient, deletePatient, bulkCreatePatients,
} from "@/lib/patients.functions";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, Search, Trash2, Upload, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_app/pacientes")({
  head: () => ({ meta: [{ title: "Pacientes — ClinicaSaaS" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: PacientesPage,
});

function PacientesPage() {
  const qc = useQueryClient();
  const session = useSession();
  const isAdmin = session.data?.role === "admin" || session.data?.role === "super_admin";

  const listFn = useServerFn(listPatients);
  const delFn = useServerFn(deletePatient);
  const [search, setSearch] = useState("");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["patients", search],
    queryFn: () => listFn({ data: { search: search || undefined } }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Paciente removido"); qc.invalidateQueries({ queryKey: ["patients"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pacientes</h1>
          <p className="text-sm text-muted-foreground">Cadastro de pacientes da clínica.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && <ImportCsvDialog onDone={() => qc.invalidateQueries({ queryKey: ["patients"] })} />}
          {isAdmin && <NewPatientDialog onCreated={() => qc.invalidateQueries({ queryKey: ["patients"] })} />}
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="p-3 border-b flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-0 shadow-none focus-visible:ring-0 px-0"
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Cadastro</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>}
            {!isLoading && (rows ?? []).length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum paciente.</TableCell></TableRow>
            )}
            {(rows ?? []).map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <Link to="/pacientes/$id" params={{ id: p.id }} className="hover:underline">
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell>{p.cpf ?? "—"}</TableCell>
                <TableCell>{p.responsible_name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(p.created_at).toLocaleDateString("pt-BR")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1">
                    {isAdmin && (
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => {
                          if (confirm(`Remover ${p.name}?`)) delMut.mutate(p.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                    <Link to="/pacientes/$id" params={{ id: p.id }}>
                      <Button variant="ghost" size="sm"><ChevronRight className="h-4 w-4" /></Button>
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function NewPatientDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const createFn = useServerFn(createPatient);
  const [form, setForm] = useState({ name: "", cpf: "", responsible_name: "", responsible_cpf: "" });
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await createFn({
        data: {
          name: form.name,
          cpf: form.cpf || null,
          responsible_name: form.responsible_name || null,
          responsible_cpf: form.responsible_cpf || null,
        },
      });
      toast.success("Paciente criado");
      setOpen(false);
      setForm({ name: "", cpf: "", responsible_name: "", responsible_cpf: "" });
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> Novo paciente</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo paciente</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>CPF</Label><Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} /></div>
            <div className="space-y-2"><Label>CPF do responsável</Label><Input value={form.responsible_cpf} onChange={(e) => setForm({ ...form, responsible_cpf: e.target.value })} /></div>
          </div>
          <div className="space-y-2"><Label>Nome do responsável</Label><Input value={form.responsible_name} onChange={(e) => setForm({ ...form, responsible_name: e.target.value })} /></div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportCsvDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const bulkFn = useServerFn(bulkCreatePatients);
  const [loading, setLoading] = useState(false);

  function handleFile(file: File) {
    setLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (res) => {
        try {
          const rows = (res.data as Array<Record<string, string>>)
            .map((r) => ({
              name: (r.name || r.nome || "").trim(),
              cpf: (r.cpf || "").trim() || null,
              responsible_name: (r.responsible_name || r.responsavel || "").trim() || null,
              responsible_cpf: (r.responsible_cpf || r.cpf_responsavel || "").trim() || null,
            }))
            .filter((r) => r.name.length >= 2);
          if (rows.length === 0) {
            toast.error("Nenhuma linha válida (esperado coluna 'name' ou 'nome').");
            return;
          }
          const out = await bulkFn({ data: { patients: rows } });
          toast.success(`${out.inserted} pacientes importados`);
          setOpen(false);
          onDone();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Erro");
        } finally {
          setLoading(false);
        }
      },
      error: (err) => {
        toast.error("Erro ao ler CSV: " + err.message);
        setLoading(false);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Upload className="h-4 w-4" /> Importar CSV</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar pacientes via CSV</DialogTitle>
          <DialogDescription>
            Colunas aceitas: <code>name</code> (ou <code>nome</code>), <code>cpf</code>, <code>responsible_name</code>, <code>responsible_cpf</code>.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="file" accept=".csv,text/csv" disabled={loading}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {loading && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Processando…</p>}
      </DialogContent>
    </Dialog>
  );
}
