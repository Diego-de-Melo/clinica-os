import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { listAuditLogs, listClinicsForFilter } from "@/lib/audit.functions";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { APP_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Download, LogOut, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/master-admin/logs")({
  head: () => ({
    meta: [{ title: `Logs — ${APP_NAME}` }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: LogsPage,
});

function LogsPage() {
  const navigate = useNavigate();
  const { data: session, isLoading: loadingSession } = useSession();
  const listFn = useServerFn(listAuditLogs);
  const clinicsFn = useServerFn(listClinicsForFilter);

  const [clinicId, setClinicId] = useState<string>("");
  const [action, setAction] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(100);

  const { data: clinics } = useQuery({
    queryKey: ["clinics-filter"],
    queryFn: () => clinicsFn(),
  });

  const filters = useMemo(
    () => ({
      limit,
      clinicId: clinicId || undefined,
      action: action || undefined,
      userEmail: userEmail || undefined,
      from: from ? new Date(from + "T00:00:00").toISOString() : undefined,
      to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
    }),
    [clinicId, action, userEmail, from, to, limit],
  );

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: () => listFn({ data: filters }),
  });

  async function logout() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  useEffect(() => {
    if (!loadingSession && (!session || session.role !== "super_admin")) {
      navigate({ to: "/login" });
    }
  }, [loadingSession, session, navigate]);

  if (loadingSession) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!session || session.role !== "super_admin") return null;

  function exportCSV() {
    const rows = logs ?? [];
    const header = ["data", "clinica", "usuario", "acao", "entidade", "record_id", "ip", "metadata"];
    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [
          new Date(r.created_at).toISOString(),
          r.clinic_name ?? "",
          r.user_email ?? "",
          r.action,
          r.entity ?? "",
          r.record_id ?? "",
          r.ip ?? "",
          JSON.stringify(r.metadata ?? {}).replace(/"/g, '""'),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b bg-card flex items-center px-6 gap-3">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <span className="font-semibold tracking-tight">Master Admin</span>
        <span className="text-sm text-muted-foreground">— Logs</span>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/master-admin">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Logs do sistema</h1>
          <p className="text-sm text-muted-foreground">
            Auditoria completa de todas as ações em todas as clínicas.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Clínica</Label>
            <select
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Todas</option>
              {(clinics ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ação</Label>
            <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="ex: backup.run" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="parte do email" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Limite</Label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
          </div>
          <div className="col-span-2 md:col-span-6 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>Atualizar</Button>
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={!logs?.length}>
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
            <span className="ml-auto text-xs text-muted-foreground self-center">
              {logs?.length ?? 0} registro(s)
            </span>
          </div>
        </div>

        <div className="rounded-xl border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Clínica</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Entidade</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Metadata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>
              )}
              {!isLoading && (logs?.length ?? 0) === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum log encontrado.</TableCell></TableRow>
              )}
              {(logs ?? []).map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-sm">{l.clinic_name ?? "—"}</TableCell>
                  <TableCell className="text-sm">{l.user_email ?? "—"}</TableCell>
                  <TableCell className="text-sm font-mono">{l.action}</TableCell>
                  <TableCell className="text-sm">{l.entity ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.ip ?? "—"}</TableCell>
                  <TableCell className="text-xs max-w-[300px] truncate" title={JSON.stringify(l.metadata)}>
                    {l.metadata ? JSON.stringify(l.metadata) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
