import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import {
  listAttendances,
  updateAttendanceStatus,
  createAttendance,
  deleteAttendance,
  allowedTransitions,
  INVOICE_FOR_LABEL,
  INVOICE_FOR_VALUES,
  PAYMENT_METHODS,
  type AttendanceStatus,
  type InvoiceFor,
  type PaymentMethod,
} from "@/lib/attendances.functions";
import { listPatients } from "@/lib/patients.functions";
import { formatDateBR } from "@/lib/utils";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActionCell, InlineAction } from "@/components/row-actions";
import { PatientCombobox } from "@/components/patient-combobox";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { AppRole } from "@/lib/auth-guards";
import { formatCPF } from "@/lib/cpf";
import { formatCNPJ } from "@/lib/cnpj";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [{ title: `Dashboard — ${APP_NAME}` }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: DashboardPage,
});

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  Pendente: "bg-slate-200 text-slate-700",
  "CPF Inválido": "bg-destructive/15 text-destructive",
  Corrigido: "bg-amber-100 text-amber-800",
  Emitido: "bg-success/15 text-success",
  Cancelado: "bg-destructive/15 text-destructive",
};

const TRANSITION_LABEL: Record<AttendanceStatus, string> = {
  Pendente: "Reabrir",
  "CPF Inválido": "CPF inválido",
  Corrigido: "Corrigir",
  Emitido: "Emitir",
  Cancelado: "Cancelar",
};

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function actionLabel(role: AppRole, current: AttendanceStatus, target: AttendanceStatus) {
  if (role === "admin" && current === "CPF Inválido" && target === "Pendente") return "Corrigir";
  return TRANSITION_LABEL[target];
}

function StatusBadge({ status }: { status: AttendanceStatus }) {
  return <Badge className={`${STATUS_STYLES[status]} border-0 font-normal`}>{status}</Badge>;
}

type PatientLite = {
  id: string;
  name: string;
  cpf: string | null;
  cnpj: string | null;
  company_name: string | null;
  father_name: string | null;
  father_cpf: string | null;
  mother_name: string | null;
  mother_cpf: string | null;
};

function invoiceRecipient(row: { invoice_for: string; patient: PatientLite | null }) {
  const inv = row.invoice_for as InvoiceFor;
  const p = row.patient;
  if (!p)
    return {
      name: "—",
      cpf: null as string | null,
      cnpj: null as string | null,
      company_name: null as string | null,
    };
  if (inv === "father")
    return { name: p.father_name || "—", cpf: p.father_cpf, cnpj: null, company_name: null };
  if (inv === "mother")
    return { name: p.mother_name || "—", cpf: p.mother_cpf, cnpj: null, company_name: null };
  if (inv === "cnpj")
    return {
      name: p.company_name || p.name,
      cpf: null,
      cnpj: p.cnpj,
      company_name: p.company_name,
    };
  return { name: p.name, cpf: p.cpf, cnpj: null, company_name: null };
}

function DashboardPage() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const listFn = useServerFn(listAttendances);
  const updateFn = useServerFn(updateAttendanceStatus);
  const deleteFn = useServerFn(deleteAttendance);

  const role = (session?.role ?? "usuario") as AppRole;
  const isAdmin = role === "admin";

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

  const allRows = data ?? [];

  // Filters: year / month / day
  const [year, setYear] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");
  const [day, setDay] = useState<string>("all");

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    allRows.forEach((r) => set.add(new Date(r.date).getFullYear()));
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [allRows]);

  const rows = useMemo(() => {
    return allRows.filter((r) => {
      const d = new Date(r.date);
      if (year !== "all" && d.getFullYear() !== Number(year)) return false;
      if (month !== "all" && d.getMonth() + 1 !== Number(month)) return false;
      if (day !== "all" && d.getDate() !== Number(day)) return false;
      return true;
    });
  }, [allRows, year, month, day]);

  const total = rows.reduce((s, r) => s + Number(r.value), 0);
  const pendentes = rows.filter((r) => r.status === "Pendente").length;
  const invalidos = rows.filter((r) => r.status === "CPF Inválido").length;
  const emitidos = rows.filter((r) => r.status === "Emitido").length;

  const hasFilter = year !== "all" || month !== "all" || day !== "all";

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Atendimentos e fluxo de faturamento da clínica.
          </p>
        </div>
        {isAdmin && (
          <NewAttendanceDialog
            onCreated={() => qc.invalidateQueries({ queryKey: ["attendances"] })}
          />
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total faturado"
          value={total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        />
        <StatCard label="Pendentes" value={String(pendentes)} />
        <StatCard label="CPF Inválido" value={String(invalidos)} accent="destructive" />
        <StatCard label="Emitidos" value={String(emitidos)} accent="success" />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="px-5 py-4 border-b flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Últimos atendimentos</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={year}
              onValueChange={(v) => {
                setYear(v);
                if (v === "all") {
                  setMonth("all");
                  setDay("all");
                }
              }}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos anos</SelectItem>
                {availableYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={month}
              onValueChange={(v) => {
                setMonth(v);
                if (v === "all") setDay("all");
              }}
              disabled={year === "all"}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos meses</SelectItem>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={day} onValueChange={setDay} disabled={month === "all"}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos dias</SelectItem>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setYear("all");
                  setMonth("all");
                  setDay("all");
                }}
              >
                Limpar
              </Button>
            )}
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Paciente</TableHead>
              <TableHead>Emitir para</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead className="w-[140px]">Status</TableHead>
              <TableHead className="min-w-[220px] text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhum atendimento.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const status = r.status as AttendanceStatus;
              const transitions = allowedTransitions(role, status);
              const patientId = r.patient?.id;
              const inv = r.invoice_for as InvoiceFor;
              const recipient = invoiceRecipient(r as never);
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {patientId ? (
                      <Link
                        to="/pacientes/$id"
                        params={{ id: patientId }}
                        className="hover:underline"
                      >
                        <div>{r.patient?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground font-normal">
                          CPF: {r.patient?.cpf ? formatCPF(r.patient.cpf) : "—"}
                        </div>
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {patientId ? (
                      <Link
                        to="/pacientes/$id"
                        params={{ id: patientId }}
                        className="hover:underline"
                      >
                        <div className="font-medium">{recipient.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {inv === "cnpj" ? (
                            recipient.cnpj ? (
                              `CNPJ: ${formatCNPJ(recipient.cnpj)}`
                            ) : (
                              (INVOICE_FOR_LABEL[inv] ?? "—")
                            )
                          ) : (
                            <>
                              {INVOICE_FOR_LABEL[inv] ?? "—"}
                              {recipient.cpf ? ` · CPF: ${formatCPF(recipient.cpf)}` : ""}
                            </>
                          )}
                        </div>
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{formatDateBR(r.date)}</TableCell>
                  <TableCell>
                    {Number(r.value).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.payment_method ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {transitions.length === 0 && !isAdmin ? (
                      <span className="text-xs text-muted-foreground">Somente leitura</span>
                    ) : (
                      <ActionCell>
                        {transitions.map((target) => (
                          <InlineAction
                            key={target}
                            label={actionLabel(role, status, target)}
                            disabled={updateMut.isPending}
                            variant={target === "CPF Inválido" ? "destructive" : "default"}
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
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success" | "warning" | "destructive";
}) {
  const color =
    accent === "success"
      ? "text-success"
      : accent === "warning"
        ? "text-warning"
        : accent === "destructive"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-card flex flex-col justify-between min-h-[140px]">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`text-3xl font-bold tracking-tight ${color}`}>{value}</div>
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
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [value, setValue] = useState("");
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [invoiceFor, setInvoiceFor] = useState<InvoiceFor>("patient");
  const [loading, setLoading] = useState(false);

  const selectedPatient = useMemo(
    () => (patients ?? []).find((p) => p.id === patientId),
    [patients, patientId],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(value.replace(",", "."));
    if (!patientId) return toast.error("Selecione um paciente");
    if (!(num > 0)) return toast.error("Valor inválido");
    if (!method) return toast.error("Selecione o método de pagamento");
    setLoading(true);
    try {
      await createFn({
        data: {
          patient_id: patientId,
          date,
          value: num,
          payment_method: method,
          status: "Pendente",
          invoice_for: invoiceFor,
        },
      });
      toast.success("Atendimento registrado");
      setOpen(false);
      setPatientId("");
      setValue("");
      setMethod("");
      setInvoiceFor("patient");
      onCreated();
    } catch (err) {
      console.error("[attendance] create failed", err);
      toast.error("Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Novo atendimento
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo atendimento</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Paciente</Label>
            <PatientCombobox
              value={patientId}
              onChange={setPatientId}
              items={(patients ?? []).map((p) => ({ id: p.id, name: p.name }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Método de pagamento</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Emitir nota para</Label>
              <Select value={invoiceFor} onValueChange={(v) => setInvoiceFor(v as InvoiceFor)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVOICE_FOR_VALUES.map((v) => {
                    const disabled =
                      (v === "father" && !selectedPatient?.father_name) ||
                      (v === "mother" && !selectedPatient?.mother_name) ||
                      (v === "cnpj" && !selectedPatient?.cnpj);
                    const suffix =
                      v === "father" && selectedPatient?.father_name
                        ? ` — ${selectedPatient.father_name}`
                        : v === "mother" && selectedPatient?.mother_name
                          ? ` — ${selectedPatient.mother_name}`
                          : v === "cnpj" && selectedPatient?.cnpj
                            ? ` — ${formatCNPJ(selectedPatient.cnpj)}`
                            : v === "patient" && selectedPatient
                              ? ` — ${selectedPatient.name}`
                              : "";
                    return (
                      <SelectItem key={v} value={v} disabled={disabled}>
                        {INVOICE_FOR_LABEL[v]}
                        {suffix}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
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
