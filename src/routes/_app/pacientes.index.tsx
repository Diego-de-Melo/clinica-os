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
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";
import { ActionCell, InlineAction } from "@/components/row-actions";
import { Loader2, Plus, Search, Trash2, Upload } from "lucide-react";

export const Route = createFileRoute("/_app/pacientes/")({
  head: () => ({
    meta: [{ title: `Pacientes — ${APP_NAME}` }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: PacientesPage,
});

type Patient = {
  id: string;
  name: string;
  cpf: string | null;
  father_name: string | null;
  father_cpf: string | null;
  mother_name: string | null;
  mother_cpf: string | null;
  created_at: string;
};

function PacientesPage() {
  const qc = useQueryClient();
  const session = useSession();
  const isAdmin = session.data?.role === "admin";

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
              <TableHead>Pai</TableHead>
              <TableHead>Mãe</TableHead>
              <TableHead>Cadastro</TableHead>
              <TableHead className="text-right min-w-[120px]">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>}
            {!isLoading && (rows ?? []).length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum paciente.</TableCell></TableRow>
            )}
            {((rows as Patient[] | undefined) ?? []).map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <Link to="/pacientes/$id" params={{ id: p.id }} className="hover:underline">
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell>{p.cpf ?? "—"}</TableCell>
                <TableCell>{p.father_name ?? "—"}</TableCell>
                <TableCell>{p.mother_name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(p.created_at).toLocaleDateString("pt-BR")}
                </TableCell>
                <TableCell className="text-right">
                  <ActionCell>
                    {isAdmin && (
                      <InlineAction
                        label="Remover"
                        icon={Trash2}
                        variant="destructive"
                        onClick={() => {
                          if (confirm(`Remover ${p.name}?`)) delMut.mutate(p.id);
                        }}
                      />
                    )}
                  </ActionCell>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type PatientForm = {
  name: string;
  cpf: string;
  father_name: string;
  father_cpf: string;
  mother_name: string;
  mother_cpf: string;
};

const EMPTY_FORM: PatientForm = {
  name: "", cpf: "",
  father_name: "", father_cpf: "",
  mother_name: "", mother_cpf: "",
};

function PatientFields({ form, setForm }: {
  form: PatientForm; setForm: (f: PatientForm) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Nome *</Label>
        <Input required minLength={2} value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>CPF</Label>
        <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
      </div>
      <div className="rounded-lg border p-3 space-y-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pai</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>Nome do pai</Label>
            <Input value={form.father_name}
              onChange={(e) => setForm({ ...form, father_name: e.target.value })} /></div>
          <div className="space-y-2"><Label>CPF do pai</Label>
            <Input value={form.father_cpf}
              onChange={(e) => setForm({ ...form, father_cpf: e.target.value })} /></div>
        </div>
      </div>
      <div className="rounded-lg border p-3 space-y-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mãe</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>Nome da mãe</Label>
            <Input value={form.mother_name}
              onChange={(e) => setForm({ ...form, mother_name: e.target.value })} /></div>
          <div className="space-y-2"><Label>CPF da mãe</Label>
            <Input value={form.mother_cpf}
              onChange={(e) => setForm({ ...form, mother_cpf: e.target.value })} /></div>
        </div>
      </div>
    </div>
  );
}

function toPayload(form: PatientForm) {
  return {
    name: form.name,
    cpf: form.cpf || null,
    father_name: form.father_name || null,
    father_cpf: form.father_cpf || null,
    mother_name: form.mother_name || null,
    mother_cpf: form.mother_cpf || null,
  };
}

function NewPatientDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const createFn = useServerFn(createPatient);
  const [form, setForm] = useState<PatientForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await createFn({ data: toPayload(form) });
      toast.success("Paciente criado");
      setOpen(false);
      setForm(EMPTY_FORM);
      onCreated();
    } catch (err) {
      console.error("[patients] operation failed", err);
      toast.error("Erro");
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
          <PatientFields form={form} setForm={setForm} />
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
              father_name: (r.father_name || r.pai || "").trim() || null,
              father_cpf: (r.father_cpf || r.cpf_pai || "").trim() || null,
              mother_name: (r.mother_name || r.mae || "").trim() || null,
              mother_cpf: (r.mother_cpf || r.cpf_mae || "").trim() || null,
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
          console.error("[patients] operation failed", err);
      toast.error("Erro");
        } finally {
          setLoading(false);
        }
      },
      error: (err) => {
        console.error("[patients] csv read failed", err);
        toast.error("Erro ao ler CSV");
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
            Colunas: <code>name</code>/<code>nome</code>, <code>cpf</code>,
            {" "}<code>pai</code>, <code>cpf_pai</code>, <code>mae</code>, <code>cpf_mae</code>.
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
