import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPatient } from "@/lib/patients.functions";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/pacientes/$id")({
  head: () => ({ meta: [{ title: "Paciente — ClinicaSaaS" }, { name: "robots", content: "noindex, nofollow" }] }),
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
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Field label="CPF" value={data.patient.cpf} />
          <Field label="Responsável" value={data.patient.responsible_name} />
          <Field label="CPF do responsável" value={data.patient.responsible_cpf} />
          <Field label="Cadastro" value={new Date(data.patient.created_at).toLocaleDateString("pt-BR")} />
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
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.attendances.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Sem atendimentos.</TableCell></TableRow>
            )}
            {data.attendances.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{new Date(a.date).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell>{Number(a.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                <TableCell>{a.payment_method}</TableCell>
                <TableCell>
                  {a.status === "Emitido" ? (
                    <Badge className="bg-success/15 text-success border-0">Emitido</Badge>
                  ) : (
                    <Badge className="bg-warning/15 text-warning border-0">Pendente</Badge>
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

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value || "—"}</div>
    </div>
  );
}
