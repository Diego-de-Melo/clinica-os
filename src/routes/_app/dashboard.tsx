import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listAttendances, updateAttendanceStatus, createAttendance, deleteAttendance,
  ATTENDANCE_STATUSES, type AttendanceStatus,
} from "@/lib/attendances.functions";
import { listPatients } from "@/lib/patients.functions";
import { useSession } from "@/hooks/use-session";
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
import { ActionCell, InlineAction } from "@/components/row-actions";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [{ title: `Dashboard — ${APP_NAME}` }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: DashboardPage,
});

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  "Pendente": "bg-slate-200 text-slate-700",
  "CPF Inválido": "bg-destructive/15 text-destructive",
  "Corrigido": "bg-amber-100 text-amber-800",
  "Emitido": "bg-success/15 text-success",
};

const STATUS_ACTION_LABEL: Record<AttendanceStatus, string> = {
  "Pendente": "Reabrir",
  "CPF Inválido": "CPF inválido",
  "Corrigido": "Corrigir",
  "Emitido": "Emitir",
};

function StatusBadge({ status }: { status: AttendanceStatus }) {
  return (
    <Badge className={`${STATUS_STYLES[status]} border-0 font-normal`}>
      {status}
    </Badge>
  );
}

function DashboardPage() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const listFn = useServerFn(listAttendances);
  const updateFn = useServerFn(updateAttendanceStatus);
  const deleteFn = useServerFn(deleteAttendance);

  const isAdmin = session?.role === "admin";
  const isContador = session?.role === "contador";
  const canEdit = isAdmin || isContador;
  const statusOptions = isContador
    ? (["Pendente", "CPF Inválido", "Emitido"] as AttendanceStatus[])
    : (ATTENDANCE_STATUSES as readonly AttendanceStatus[]);

  const { data, isLoading } = useQuery({
    queryKey: ["attendances"],
    queryFn: () => listFn(),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AttendanceStatus }) =>
      updateFn({ data: { id, status } }),
    onSuccess: () => {
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["attendances"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Atendimento removido");
      qc.invalidateQueries({ queryKey: ["attendances"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const rows = data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.value), 0);
  const pendentes = rows.filter((r) => r.status === "Pendente").length;
  const invalidos = rows.filter((r) => r.status === "CPF Inválido").length;
  const emitidos = rows.filter((r) => r.status === "Emitido").length;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Atendimentos e fluxo de faturamento da clínica.</p>
        </div>
        {isAdmin && (
          <NewAttendanceDialog onCreated={() => qc.invalidateQueries({ queryKey: ["attendances"] })} />
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total faturado" value={total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
        <StatCard label="Pendentes" value={String(pendentes)} />
        <StatCard label="CPF Inválido" value={String(invalidos)} accent="destructive" />
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
              <TableHead className="w-[140px]">Status</TableHead>
              <TableHead className="min-w-[220px] text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum atendimento ainda.</TableCell></TableRow>
            )}
            {rows.map((r) => {
              const status = r.status as AttendanceStatus;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.patient?.name ?? "—"}</TableCell>
                  <TableCell>{new Date(r.date).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>{Number(r.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                  <TableCell className="text-muted-foreground">{r.payment_method ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {canEdit ? (
                      <ActionCell>
                        {statusOptions
                          .filter((s) => s !== status)
                          .map((target) => (
                            <InlineAction
                              key={target}
                              label={STATUS_ACTION_LABEL[target]}
                              disabled={updateMut.isPending}
                              onClick={() => updateMut.mutate({ id: r.id, status: target })}
                            />
                          ))}
                        {isAdmin && (
                          <InlineAction
                            label="Remover"
                            icon={Trash2}
                            variant="destructive"
                            disabled={deleteMut.isPending}
                            onClick={() => {
                              if (confirm("Remover este atendimento?")) deleteMut.mutate(r.id);
                            }}
                          />
                        )}
                      </ActionCell>
                    ) : (
                      <span className="text-xs text-muted-foreground">Somente leitura</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatCard({
  label, value, accent,
}: { label: string; value: string; accent?: "success" | "warning" | "destructive" }) {
  const color =
    accent === "success" ? "text-success"
    : accent === "warning" ? "text-warning"
    : accent === "destructive" ? "text-destructive"
    : "text-foreground";
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
  const [method, setMethod] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(value.replace(",", "."));
    if (!patientId) return toast.error("Selecione um paciente");
    if (!(num > 0)) return toast.error("Valor inválido");
    setLoading(true);
    try {
      await createFn({
        data: {
          patient_id: patientId, date, value: num,
          payment_method: method || null,
          status: "Pendente",
        },
      });
      toast.success("Atendimento registrado");
      setOpen(false);
      setPatientId(""); setValue(""); setMethod("");
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
            <Label>Método de pagamento (opcional)</Label>
            <Input
              type="text"
              placeholder="Ex.: Pix, Dinheiro, Cartão…"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              maxLength={40}
            />
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
