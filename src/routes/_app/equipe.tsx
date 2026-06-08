import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listTeam, createTeamMember, deleteTeamMember, updateTeamMemberRole,
} from "@/lib/team.functions";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";
import { ActionCell, InlineAction } from "@/components/row-actions";
import { Plus, Loader2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/equipe")({
  head: () => ({
    meta: [{ title: `Equipe — ${APP_NAME}` }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: EquipePage,
});

type Role = "admin" | "contador" | "operador" | "usuario";
const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  contador: "Contador",
  operador: "Operador",
  usuario: "Usuário",
  user: "Usuário",
  super_admin: "Super Admin",
};

function EquipePage() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const listFn = useServerFn(listTeam);
  const delFn = useServerFn(deleteTeamMember);
  const roleFn = useServerFn(updateTeamMemberRole);
  const { data: team, isLoading } = useQuery({
    queryKey: ["team"], queryFn: () => listFn(),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Membro removido"); qc.invalidateQueries({ queryKey: ["team"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => roleFn({ data: { id, role } }),
    onSuccess: () => { toast.success("Papel atualizado"); qc.invalidateQueries({ queryKey: ["team"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Equipe da clínica</h1>
          <p className="text-sm text-muted-foreground">Convide e defina níveis de acesso.</p>
        </div>
        <NewMemberDialog onDone={() => qc.invalidateQueries({ queryKey: ["team"] })} />
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead className="w-[200px]">Papel</TableHead>
              <TableHead>Cadastro</TableHead>
              <TableHead className="text-right min-w-[120px]">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>}
            {(team ?? []).map((m) => {
              const isSelf = m.id === session?.userId;
              const isRoleEditable = !isSelf && (m.role === "admin" || m.role === "contador" || m.role === "operador" || m.role === "usuario");
              return (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.email}</TableCell>
                  <TableCell>
                    {isRoleEditable ? (
                      <Select
                        value={m.role}
                        onValueChange={(v) => roleMut.mutate({ id: m.id, role: v as Role })}
                        disabled={roleMut.isPending}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="operador">Operador</SelectItem>
                          <SelectItem value="contador">Contador</SelectItem>
                          <SelectItem value="usuario">Usuário</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{ROLE_LABELS[m.role] ?? m.role}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{new Date(m.created_at).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="text-right">
                    {!isSelf ? (
                      <ActionCell>
                        <InlineAction
                          label="Remover"
                          icon={Trash2}
                          variant="destructive"
                          disabled={delMut.isPending}
                          onClick={() => {
                            if (confirm(`Remover ${m.email}?`)) delMut.mutate(m.id);
                          }}
                        />
                      </ActionCell>
                    ) : (
                      <span className="text-xs text-muted-foreground">Você</span>
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


function NewMemberDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const fn = useServerFn(createTeamMember);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("usuario");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fn({ data: { email, password, role } });
      toast.success("Membro adicionado");
      setOpen(false);
      setEmail(""); setPassword(""); setRole("usuario");
      onDone();
    } catch (err) {
      console.error("[team] create failed", err);
      toast.error("Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Adicionar membro</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar membro</DialogTitle>
          <DialogDescription>Crie o acesso e defina o nível de permissão.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-2"><Label>Senha (mín. 8)</Label><Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Papel</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="usuario">Usuário — somente leitura</SelectItem>
                <SelectItem value="contador">Contador — edita status de atendimentos</SelectItem>
                <SelectItem value="admin">Admin — controle total da clínica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter><Button type="submit" disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />} Criar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
