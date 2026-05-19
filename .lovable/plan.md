# Plano — Adaptação ao Super Prompt expandido

O projeto atual já implementa ~70% do escopo (auth, multi-tenant, RLS, bloqueio por vencimento, super-admin, CRUD pacientes, CSV, equipe). Este plano cobre apenas as **diferenças** entre o que está em produção e o novo Super Prompt.

## 1. Hierarquia de 4 níveis (hoje só há 3)

Adicionar role `contador`. Enum final: `super_admin | admin | contador | usuario` (renomeia `user` → `usuario`).

Permissões:
| Ação | super_admin | admin | contador | usuario |
|---|---|---|---|---|
| Ver pacientes/atendimentos | ❌ (LGPD) | ✅ | ✅ | ✅ |
| Criar/editar pacientes | ❌ | ✅ | ❌ | ❌ |
| Apagar pacientes | ❌ | ✅ | ❌ | ❌ |
| Criar atendimento | ❌ | ✅ | ✅ | ❌ |
| Alterar status atendimento | ❌ | ✅ | ✅ | ❌ |
| Apagar atendimento | ❌ | ✅ | ❌ | ❌ |
| Importar CSV / Equipe | ❌ | ✅ | ❌ | ❌ |

## 2. LGPD: Super Admin sem acesso a dados clínicos

Hoje as policies de `patients`/`attendances` só permitem `clinic_id = current_clinic_id()`. Como super_admin tem `clinic_id = NULL`, `current_clinic_id()` retorna NULL e o `=` falha → já está bloqueado naturalmente. **Adicionar assert explícito** nas policies (`current_clinic_id() IS NOT NULL`) para deixar a intenção explícita e à prova de regressão.

## 3. Fluxo de status do atendimento

Hoje: `Pendente | Emitido`.
Novo: `Pendente | CPF Inválido | Corrigido | Emitido`.

- Migration: alterar CHECK do `status`.
- UI dashboard: dropdown de status (não mais toggle); badges coloridos por estado.
- Lógica: contador pode mover para qualquer estado; admin idem; usuario read-only.
- Remover `payment_method` (não está mais no spec) — manter como opcional/nullable para não quebrar dados existentes.

## 4. Rotas (renomeações + landing)

| Hoje | Novo |
|---|---|
| `/` (redireciona) | `/` landing pública institucional |
| `/super-admin` | `/master-admin` |
| `/configuracoes` | `/equipe` |
| `/setup` | **remover** (sem bootstrap público; super_admin promovido via SQL conforme decidido) |

Landing `/`: hero curto + 2 CTAs ("Entrar em Contato" via mailto/WhatsApp, "Login"). Indexável (sem `noindex`). Demais rotas autenticadas: `noindex, nofollow`.

## 5. Tela `/equipe`

Adicionar seletor de role ao convidar (admin / contador / usuario). Atualizar `team.functions.ts` para aceitar e validar o role.

## 6. Trava de bloqueio

Já implementada via `getSessionContext` + `_app.tsx`. Validar que super_admin nunca é bloqueado (já garantido) e que a verificação roda também no `beforeLoad` para evitar flash de conteúdo.

## 7. UI

Já está Shadcn + Tailwind clean. Ajustar fundo para `bg-slate-50` no shell autenticado e revisar badges de status com as 4 cores (cinza/vermelho/âmbar/verde).

## 8. Removido do escopo anterior

- `payment_method` obrigatório no form → opcional (campo some do formulário por padrão).
- Rota `/setup` deletada.

---

## Detalhes técnicos

**Migration única** contendo:
1. `ALTER TYPE app_role ADD VALUE 'contador';` + `ADD VALUE 'usuario';` (manter `user` por compatibilidade ou renomear via novo tipo + swap).
2. `ALTER TABLE attendances DROP CONSTRAINT ... ; ADD CHECK (status IN ('Pendente','CPF Inválido','Corrigido','Emitido'));`
3. Recriar policies de `patients`/`attendances` com checagem explícita `current_clinic_id() IS NOT NULL` e separar DELETE/UPDATE por role (contador pode UPDATE em attendances mas não em patients; usuario só SELECT).

**Arquivos a editar:**
- `supabase/migrations/<novo>.sql`
- `src/lib/attendances.functions.ts` (statuses, remover `payment_method` obrigatório)
- `src/lib/patients.functions.ts` (guard role para mutações)
- `src/lib/team.functions.ts` (aceitar role contador/usuario)
- `src/routes/index.tsx` → landing
- `src/routes/super-admin.tsx` → renomear para `master-admin.tsx`
- `src/routes/_app/configuracoes.tsx` → renomear para `equipe.tsx`
- `src/routes/_app/dashboard.tsx` (dropdown de status, badges)
- `src/routes/_app.tsx` (sidebar: itens por role; link `/equipe` e `/master-admin`)
- **deletar** `src/routes/setup.tsx`, `src/lib/bootstrap.functions.ts`

**SQL de RLS final** (resumo): documentado no arquivo de migration, com policies separadas por role usando `current_role()` helper já existente.

---

Pronto para implementar — confirme para eu prosseguir.
