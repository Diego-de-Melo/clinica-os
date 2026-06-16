import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getPatient, updatePatient } from "@/lib/patients.functions";
import {
  createAttendance, updateAttendance, deleteAttendance,
  INVOICE_FOR_LABEL, INVOICE_FOR_VALUES, PAYMENT_METHODS,
  ATTENDANCE_STATUSES,
  type InvoiceFor, type PaymentMethod, type AttendanceStatus,
} from "@/lib/attendances.functions";
import { useSession } from "@/hooks/use-session";
import { APP_NAME } from "@/lib/constants";
import { ArrowLeft, Pencil, Plus, Trash2, Eye, Loader2 } from "lucide-react";
import { formatCPF } from "@/lib/cpf";
import { formatCNPJ } from "@/lib/cnpj";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/pacientes/$id")({
  head: () => ({
    meta: [{ title: `Paciente — ${APP_NAME}` }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: PatientDetail,
});

type AttendanceRow = {
  id: string;
  date: string;
  value: number;
  payment_method: string | null;
  status: string;
  invoice_for: string;
  observacoes?: string | null;
};

function PatientDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isAdmin = session?.role === "admin";

  const getFn = useServerFn(getPatient);
  const { data, isLoading, error } = useQuery({
    queryKey: ["patient", id],
    queryFn: () => getFn({ data: { id } }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const [editPatientOpen, setEditPatientOpen] = useState(false);
  const [newAttOpen, setNewAttOpen] = useState(false);
  const [editAtt, setEditAtt] = useState<AttendanceRow | null>(null);
  const [viewAtt, setViewAtt] = useState<AttendanceRow | null>(null);
  const [delAtt, setDelAtt] = useState<AttendanceRow | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["patient", id] });

  if (isLoading) return <div className="text-sm text-muted-foreground">Carregando…</div>;
  if (error || !data) return <div className="text-sm text-destructive">Erro ao carregar paciente.</div>;

  const total = data.attendances.reduce((s, a) => s + Number(a.value), 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <Link to="/pacientes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Pacientes
      </Link>

      <div className="rounded-2xl border bg-card p-6 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{data.patient.name}</h1>
            <p className="text-sm text-muted-foreground">Perfil do paciente e histórico de atendimentos</p>
          </div>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setEditPatientOpen(true)}>
              <Pencil className="h-4 w-4" /> Editar
            </Button>
          )}
        </div>
        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <Field label="CPF" value={formatCPF(data.patient.cpf)} />
          <Field label="CNPJ" value={formatCNPJ(data.patient.cnpj)} />
          <Field label="Empresa" value={data.patient.company_name} />
          <Field label="Cadastro" value={new Date(data.patient.created_at).toLocaleDateString("pt-BR")} />
          <div />
          <Field label="Pai" value={data.patient.father_name} />
          <Field label="CPF do pai" value={formatCPF(data.patient.father_cpf)} />
          <div />
          <Field label="Mãe" value={data.patient.mother_name} />
          <Field label="CPF da mãe" value={formatCPF(data.patient.mother_cpf)} />
        </div>
      </div>

      <div className="rounded-2xl border bg-card shadow-card">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">Histórico de Atendimentos</h2>
            <div className="text-xs text-muted-foreground mt-0.5">
              Total: <span className="font-semibold text-foreground">{total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
            </div>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setNewAttOpen(true)}>
              <Plus className="h-4 w-4" /> Novo Atendimento
            </Button>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Emitir para</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.attendances.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sem atendimentos.</TableCell></TableRow>
            )}
            {data.attendances.map((a) => {
              const inv = a.invoice_for as InvoiceFor | undefined;
              const recipientCpf =
                inv === "father" ? data.patient.father_cpf
                : inv === "mother" ? data.patient.mother_cpf
                : inv === "cnpj" ? null
                : data.patient.cpf;
              const recipientCnpj = inv === "cnpj" ? data.patient.cnpj : null;
              return (
                <TableRow key={a.id}>
                  <TableCell>{new Date(a.date).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>{Number(a.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                  <TableCell>{a.payment_method ?? "—"}</TableCell>
                  <TableCell>
                    <div>{inv ? INVOICE_FOR_LABEL[inv] : "—"}</div>
                    {recipientCnpj && <div className="text-xs text-muted-foreground">CNPJ: {formatCNPJ(recipientCnpj)}</div>}
                    {inv === "cnpj" && data.patient.company_name && <div className="text-xs text-muted-foreground">{data.patient.company_name}</div>}
                    {recipientCpf && <div className="text-xs text-muted-foreground">CPF: {formatCPF(recipientCpf)}</div>}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={a.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setViewAtt(a as AttendanceRow)} aria-label="Visualizar">
                        <Eye className="h-4 w-4" />
                      </Button>
                      {isAdmin && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => setEditAtt(a as AttendanceRow)} aria-label="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDelAtt(a as AttendanceRow)} aria-label="Excluir">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {editPatientOpen && (
        <EditPatientDialog
          patient={data.patient}
          onClose={() => setEditPatientOpen(false)}
          onDone={() => { setEditPatientOpen(false); invalidate(); }}
        />
      )}
      {newAttOpen && (
        <AttendanceDialog
          patientId={id}
          mode="create"
          onClose={() => setNewAttOpen(false)}
          onDone={() => { setNewAttOpen(false); invalidate(); }}
        />
      )}
      {editAtt && (
        <AttendanceDialog
          patientId={id}
          mode="edit"
          attendance={editAtt}
          onClose={() => setEditAtt(null)}
          onDone={() => { setEditAtt(null); invalidate(); }}
        />
      )}
      {viewAtt && (
        <ViewAttendanceDialog attendance={viewAtt} onClose={() => setViewAtt(null)} />
      )}
      {delAtt && (
        <DeleteAttendanceDialog
          attendance={delAtt}
          onClose={() => setDelAtt(null)}
          onDone={() => { setDelAtt(null); invalidate(); }}
        />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value || "—"}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "Emitido") return <Badge variant="success">Emitido</Badge>;
  if (status === "CPF Inválido") return <Badge variant="destructive">CPF Inválido</Badge>;
  if (status === "Cancelado") return <Badge variant="destructive">Cancelado</Badge>;
  if (status === "Pendente") return <Badge variant="warning">Pendente</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

// ---------- Edit patient ----------
function EditPatientDialog({
  patient, onClose, onDone,
}: {
  patient: { id: string; name: string; cpf: string | null; cnpj: string | null; company_name: string | null; father_name: string | null; father_cpf: string | null; mother_name: string | null; mother_cpf: string | null };
  onClose: () => void; onDone: () => void;
}) {
  const updFn = useServerFn(updatePatient);
  const [form, setForm] = useState({
    name: patient.name,
    cpf: formatCPF(patient.cpf),
    cnpj: formatCNPJ(patient.cnpj),
    company_name: patient.company_name ?? "",
    father_name: patient.father_name ?? "",
    father_cpf: formatCPF(patient.father_cpf),
    mother_name: patient.mother_name ?? "",
    mother_cpf: formatCPF(patient.mother_cpf),
  });
  const mut = useMutation({
    mutationFn: () => updFn({
      data: {
        id: patient.id,
        name: form.name.trim(),
        cpf: form.cpf.trim() || null,
        cnpj: form.cnpj.trim() || null,
        company_name: form.company_name.trim() || null,
        father_name: form.father_name.trim() || null,
        father_cpf: form.father_cpf.trim() || null,
        mother_name: form.mother_name.trim() || null,
        mother_cpf: form.mother_cpf.trim() || null,
      },
    }),
    onSuccess: () => { toast.success("Paciente atualizado"); onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar paciente</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div className="space-y-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} /></div>
          <div className="space-y-2"><Label>CPF</Label><Input value={form.cpf} inputMode="numeric" maxLength={14} placeholder="000.000.000-00" onChange={(e) => setForm({ ...form, cpf: formatCPF(e.target.value) })} /></div>
          <div className="space-y-2"><Label>CNPJ</Label><Input value={form.cnpj} inputMode="numeric" maxLength={18} placeholder="00.000.000/0000-00" onChange={(e) => setForm({ ...form, cnpj: formatCNPJ(e.target.value) })} /></div>
          <div className="space-y-2"><Label>Nome da empresa</Label><Input value={form.company_name} maxLength={120} placeholder="Razão social" onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Pai</Label><Input value={form.father_name} onChange={(e) => setForm({ ...form, father_name: e.target.value })} /></div>
            <div className="space-y-2"><Label>CPF do pai</Label><Input value={form.father_cpf} inputMode="numeric" maxLength={14} placeholder="000.000.000-00" onChange={(e) => setForm({ ...form, father_cpf: formatCPF(e.target.value) })} /></div>
            <div className="space-y-2"><Label>Mãe</Label><Input value={form.mother_name} onChange={(e) => setForm({ ...form, mother_name: e.target.value })} /></div>
            <div className="space-y-2"><Label>CPF da mãe</Label><Input value={form.mother_cpf} inputMode="numeric" maxLength={14} placeholder="000.000.000-00" onChange={(e) => setForm({ ...form, mother_cpf: formatCPF(e.target.value) })} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Create / Edit Attendance ----------
function AttendanceDialog({
  patientId, mode, attendance, onClose, onDone,
}: {
  patientId: string;
  mode: "create" | "edit";
  attendance?: AttendanceRow;
  onClose: () => void; onDone: () => void;
}) {
  const createFn = useServerFn(createAttendance);
  const updateFn = useServerFn(updateAttendance);
  const [form, setForm] = useState({
    date: attendance?.date ?? (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })(),
    value: attendance ? String(attendance.value).replace(".", ",") : "",
    payment_method: (attendance?.payment_method ?? "") as PaymentMethod | "",
    status: (attendance?.status ?? "Pendente") as AttendanceStatus,
    invoice_for: (attendance?.invoice_for ?? "patient") as InvoiceFor,
    observacoes: attendance?.observacoes ?? "",
  });
  const mut = useMutation({
    mutationFn: async () => {
      const value = Number(form.value.replace(",", "."));
      if (!(value > 0)) throw new Error("Valor inválido");
      if (!form.payment_method) throw new Error("Selecione a forma de pagamento");
      const payload = {
        date: form.date,
        value,
        payment_method: form.payment_method as PaymentMethod,
        status: form.status,
        invoice_for: form.invoice_for,
        observacoes: form.observacoes.trim() || null,
      };
      if (mode === "create") {
        await createFn({ data: { ...payload, patient_id: patientId } });
      } else if (attendance) {
        await updateFn({ data: { id: attendance.id, ...payload } });
      }
    },
    onSuccess: () => { toast.success(mode === "create" ? "Atendimento registrado" : "Atendimento atualizado"); onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{mode === "create" ? "Novo Atendimento" : "Editar Atendimento"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input inputMode="decimal" placeholder="0,00" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v as PaymentMethod })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as AttendanceStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ATTENDANCE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Emitir nota para</Label>
            <Select value={form.invoice_for} onValueChange={(v) => setForm({ ...form, invoice_for: v as InvoiceFor })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVOICE_FOR_VALUES.map((v) => <SelectItem key={v} value={v}>{INVOICE_FOR_LABEL[v]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar atendimento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ViewAttendanceDialog({ attendance, onClose }: { attendance: AttendanceRow; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Atendimento</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          <div><span className="text-muted-foreground">Data:</span> {new Date(attendance.date).toLocaleDateString("pt-BR")}</div>
          <div><span className="text-muted-foreground">Valor:</span> {Number(attendance.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
          <div><span className="text-muted-foreground">Forma de pagamento:</span> {attendance.payment_method ?? "—"}</div>
          <div><span className="text-muted-foreground">Status:</span> {attendance.status}</div>
          <div><span className="text-muted-foreground">Emitir para:</span> {INVOICE_FOR_LABEL[attendance.invoice_for as InvoiceFor] ?? "—"}</div>
          <div>
            <div className="text-muted-foreground">Observações:</div>
            <div className="mt-1 whitespace-pre-wrap">{attendance.observacoes || "—"}</div>
          </div>
        </div>
        <DialogFooter><Button onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAttendanceDialog({
  attendance, onClose, onDone,
}: { attendance: AttendanceRow; onClose: () => void; onDone: () => void }) {
  const delFn = useServerFn(deleteAttendance);
  const mut = useMutation({
    mutationFn: () => delFn({ data: { id: attendance.id } }),
    onSuccess: () => { toast.success("Atendimento excluído"); onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir atendimento?</AlertDialogTitle>
          <AlertDialogDescription>
            O registro será marcado como excluído e ocultado das listagens. Esta ação pode ser revertida pelo administrador do banco.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mut.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={mut.isPending} onClick={(e) => { e.preventDefault(); mut.mutate(); }}>
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
