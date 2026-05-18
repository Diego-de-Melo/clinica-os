import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listAttendances, updateAttendanceStatus, createAttendance } from "@/lib/attendances.functions";
import { listPatients } from "@/lib/patients.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Plus } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — ClinicaSaaS" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAttendances);
  const updateFn = useServerFn(updateAttendanceStatus);

  const { data, isLoading } = useQuery({
    queryKey: ["attendances"],
    queryFn: () => listFn(),
  });

  const updateMut = useMutation({
    mutationFn: (id: string) => updateFn({ data: { id, status: "Emitido" } }),
    onSuccess: () => {
      toast.success("Atendimento marcado como Emitido");
      qc.invalidateQueries({ queryKey: ["attendances"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const rows = data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.value), 0);
  const pendentes = rows.filter((r) => r.status === "Pendente").length;
  const emitidos = rows.filter((r) => r.status === "Emitido").length;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Atendimentos recentes da clínica.</p>
        </div>
        <NewAttendanceDialog onCreated={() => qc.invalidateQueries({ queryKey: ["attendances"] })} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Total faturado" value={total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
        <StatCard label="Pendentes" value={String(pendentes)} accent="warning" />
        <StatCard label="Emitidos" value={String(emitidos)} accent="success" />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="px-5 py-4 border-b">
          <h2 className="text-sm font-medium">Últimos atendimentos</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Paciente</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum atendimento ainda.</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.patient?.name ?? "—"}</TableCell>
                <TableCell>{new Date(r.date).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell>{Number(r.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                <TableCell>{r.payment_method}</TableCell>
                <TableCell>
                  {r.status === "Emitido" ? (
                    <Badge className="bg-success/15 text-success hover:bg-success/15 border-0">Emitido</Badge>
                  ) : (
                    <Badge className="bg-warning/15 text-warning hover:bg-warning/15 border-0">Pendente</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {r.status === "Pendente" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateMut.isPending}
                      onClick={() => updateMut.mutate(r.id)}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Marcar como Emitido
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: "success" | "warning" }) {
  const color =
    accent === "success" ? "text-success" : accent === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function NewAttendanceDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const listPat = useServerFn(listPatients);
  const createFn = useServerFn(createAttendance);
  const { data: patients } = useQuery({
    queryKey: ["patients-min"],
    queryFn: () => listPat({ data: {} }),
    enabled: open,
  });

  const [patientId, setPatientId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [value, setValue] = useState("");
  const [method, setMethod] = useState<"Pix" | "Dinheiro">("Pix");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(value.replace(",", "."));
    if (!patientId) return toast.error("Selecione um paciente");
    if (!(num > 0)) return toast.error("Valor inválido");
    setLoading(true);
    try {
      await createFn({
        data: { patient_id: patientId, date, value: num, payment_method: method, status: "Pendente" },
      });
      toast.success("Atendimento registrado");
      setOpen(false);
      setPatientId(""); setValue("");
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
        <Button><Plus className="h-4 w-4" /> Novo atendimento</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo atendimento</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Paciente</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger><SelectValue placeholder="Selecione um paciente" /></SelectTrigger>
              <SelectContent>
                {(patients ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="text" inputMode="decimal" placeholder="0,00" value={value} onChange={(e) => setValue(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Método de pagamento</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as "Pix" | "Dinheiro")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Pix">Pix</SelectItem>
                <SelectItem value="Dinheiro">Dinheiro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
