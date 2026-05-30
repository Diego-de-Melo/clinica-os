import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPatient } from "@/lib/patients.functions";
import { INVOICE_FOR_LABEL, type InvoiceFor } from "@/lib/attendances.functions";
import { APP_NAME } from "@/lib/constants";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/pacientes/$id")({
  head: () => ({
    meta: [{ title: `Paciente — ${APP_NAME}` }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: PatientDetail,
});

function PatientDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getPatient);
  const { data, isLoading, error } = useQuery({
    queryKey: ["patient", id],
    queryFn: () => fn({ data: { id } }),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Carregando…</div>;
  if (error || !data) return <div className="text-sm text-destructive">Erro ao carregar paciente.</div>;

  const total = data.attendances.reduce((s, a) => s + Number(a.value), 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <Link to="/pacientes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Pacientes
      </Link>

      <div className="rounded-xl border bg-card p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{data.patient.name}</h1>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <Field label="CPF" value={data.patient.cpf} />
          <Field label="Cadastro" value={new Date(data.patient.created_at).toLocaleDateString("pt-BR")} />
          <div />
          <Field label="Pai" value={data.patient.father_name} />
          <Field label="CPF do pai" value={data.patient.father_cpf} />
          <div />
          <Field label="Mãe" value={data.patient.mother_name} />
          <Field label="CPF da mãe" value={data.patient.mother_cpf} />
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-sm font-medium">Histórico de atendimentos</h2>
          <div className="text-sm text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Emitir para</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.attendances.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sem atendimentos.</TableCell></TableRow>
            )}
            {data.attendances.map((a) => {
              const inv = (a as { invoice_for?: string }).invoice_for as InvoiceFor | undefined;
              const recipientCpf =
                inv === "father" ? data.patient.father_cpf
                : inv === "mother" ? data.patient.mother_cpf
                : data.patient.cpf;
              return (
                <TableRow key={a.id}>
                  <TableCell>{new Date(a.date).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>{Number(a.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                  <TableCell>{a.payment_method ?? "—"}</TableCell>
                  <TableCell>
                    <div>{inv ? INVOICE_FOR_LABEL[inv] : "—"}</div>
                    {recipientCpf && <div className="text-xs text-muted-foreground">CPF: {recipientCpf}</div>}
                  </TableCell>
                  <TableCell>
                    {a.status === "Emitido" ? (
                      <Badge className="bg-success/15 text-success border-0">Emitido</Badge>
                    ) : a.status === "CPF Inválido" ? (
                      <Badge className="bg-destructive/15 text-destructive border-0">CPF Inválido</Badge>
                    ) : (
                      <Badge className="bg-slate-200 text-slate-700 border-0">{a.status}</Badge>
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

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value || "—"}</div>
    </div>
  );
}
