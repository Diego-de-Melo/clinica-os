import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listBackups,
  getBackupConfig,
  updateBackupConfig,
  generateBackupNow,
  downloadBackup,
  restoreBackup,
} from "@/lib/backups.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Database, Download, Loader2, RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/backups")({
  component: BackupsPage,
});

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function BackupsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listBackups);
  const cfgFn = useServerFn(getBackupConfig);
  const updCfgFn = useServerFn(updateBackupConfig);
  const genFn = useServerFn(generateBackupNow);
  const dlFn = useServerFn(downloadBackup);
  const restoreFn = useServerFn(restoreBackup);

  const { data: cfg } = useQuery({ queryKey: ["backup-config"], queryFn: () => cfgFn() });
  const { data: backups, isLoading } = useQuery({
    queryKey: ["backups"],
    queryFn: () => listFn(),
  });

  const updCfg = useMutation({
    mutationFn: (v: { enabled: boolean; retention_days: 30 | 90 | 365 }) =>
      updCfgFn({ data: v }),
    onSuccess: () => {
      toast.success("Configuração atualizada");
      qc.invalidateQueries({ queryKey: ["backup-config"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const gen = useMutation({
    mutationFn: () => genFn(),
    onSuccess: () => {
      toast.success("Backup gerado com sucesso");
      qc.invalidateQueries({ queryKey: ["backups"] });
      qc.invalidateQueries({ queryKey: ["backup-config"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const download = useMutation({
    mutationFn: (id: string) => dlFn({ data: { id } }),
    onSuccess: async (response) => {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Tenta extrair filename do header Content-Disposition
      const cd = response.headers.get("Content-Disposition");
      let filename = "backup.json";
      if (cd) {
        const m = cd.match(/filename="([^"]+)"/);
        if (m) filename = m[1];
      }
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Download iniciado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const restore = useMutation({
    mutationFn: (id: string) => restoreFn({ data: { id, confirmation: "RESTAURAR" } }),
    onSuccess: (r) => {
      toast.success(
        `Restaurado: ${r.upserted.patients} pacientes, ${r.upserted.attendances} atendimentos`,
      );
      setRestoreTarget(null);
      setConfirmText("");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Backups</h1>
        <p className="text-sm text-muted-foreground">
          Snapshots criptografados (AES-256-GCM) dos dados da clínica. Backup automático diário às 03h.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4 space-y-3 md:col-span-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Configuração</h2>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Backup automático diário</Label>
              <p className="text-xs text-muted-foreground">Executa às 03h (horário de Brasília).</p>
            </div>
            <Switch
              checked={cfg?.enabled ?? true}
              disabled={updCfg.isPending}
              onCheckedChange={(v) =>
                updCfg.mutate({
                  enabled: v,
                  retention_days: (cfg?.retention_days ?? 90) as 30 | 90 | 365,
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Retenção</Label>
            <select
              value={cfg?.retention_days ?? 90}
              disabled={updCfg.isPending}
              onChange={(e) =>
                updCfg.mutate({
                  enabled: cfg?.enabled ?? true,
                  retention_days: Number(e.target.value) as 30 | 90 | 365,
                })
              }
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value={30}>30 dias</option>
              <option value={90}>90 dias</option>
              <option value={365}>365 dias</option>
            </select>
          </div>
          <div className="text-xs text-muted-foreground">
            Última execução:{" "}
            {cfg?.last_run_at ? new Date(cfg.last_run_at).toLocaleString("pt-BR") : "—"}{" "}
            {cfg?.last_status && (
              <Badge
                className={
                  cfg.last_status === "success"
                    ? "bg-success/15 text-success border-0 ml-2"
                    : "bg-destructive/15 text-destructive border-0 ml-2"
                }
              >
                {cfg.last_status}
              </Badge>
            )}
            {cfg?.last_error && <span className="block mt-1 text-destructive">{cfg.last_error}</span>}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Gerar agora</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Cria um snapshot imediato dos dados atuais.
          </p>
          <Button onClick={() => gen.mutate()} disabled={gen.isPending} className="mt-auto">
            {gen.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Gerar backup agora
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Versão</TableHead>
              <TableHead>Pacientes</TableHead>
              <TableHead>Atendimentos</TableHead>
              <TableHead>Tamanho</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>
            )}
            {!isLoading && (backups?.length ?? 0) === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum backup ainda. Gere o primeiro acima.</TableCell></TableRow>
            )}
            {(backups ?? []).map((b) => {
              const counts = (b.record_counts ?? {}) as { patients?: number; attendances?: number };
              return (
                <TableRow key={b.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {new Date(b.created_at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="font-mono text-xs">v{b.version}</TableCell>
                  <TableCell className="text-sm">{counts.patients ?? 0}</TableCell>
                  <TableCell className="text-sm">{counts.attendances ?? 0}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatBytes(b.size_bytes)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {b.created_by === "system" ? "Automático" : "Manual"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => download.mutate(b.id)}
                        disabled={download.isPending}
                      >
                        <Download className="h-4 w-4" /> Baixar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRestoreTarget(b.id)}
                      >
                        <RefreshCw className="h-4 w-4" /> Restaurar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!restoreTarget} onOpenChange={(o) => { if (!o) { setRestoreTarget(null); setConfirmText(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Restaurar backup
            </DialogTitle>
            <DialogDescription>
              Esta operação irá <strong>sobrescrever</strong> registros existentes com os dados do snapshot.
              Registros criados após o snapshot serão preservados. Esta ação é registrada na auditoria.
              <br /><br />
              Para confirmar, digite <strong>RESTAURAR</strong> abaixo.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="RESTAURAR"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRestoreTarget(null); setConfirmText(""); }}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText !== "RESTAURAR" || restore.isPending}
              onClick={() => restoreTarget && restore.mutate(restoreTarget)}
            >
              {restore.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Restaurar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
