# ClinicaOS — Correções de Segurança (35 achados) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os 35 achados da auditoria de segurança de 27/09/2026 do repositório `clinica-os`, com verificação em Postgres real (Supabase local via Docker) para toda mudança de SQL, e entregar tudo em blocos commitados e pushados.

**Architecture:** Três frentes que se separam por tipo de correção: (1) **SQL/migrations** — quase todos os achados de RLS, privilégios e gatilhos viram 3 migrations novas, verificadas por uma suíte de integração nova (`tests/rls/`) que sobe o Supabase local e prova isolamento de tenant com dois usuários reais; (2) **código TypeScript** — correções nos server functions, guards, criptografia, LGPD e UI, sempre com teste unitário novo antes da implementação; (3) **infra/toolchain** — headers de segurança no Worker, rate limiting, migração para cookies httpOnly, lockfile única, CI e atualização de dependências.

**Tech Stack:** TanStack Start (React 19, server functions) · Supabase (Postgres + Auth + Storage, RLS) · Cloudflare Workers (wrangler, `src/server.ts`) · Vitest (unit) + Supabase CLI 2.106.0 + Docker Desktop (integração) · TypeScript 5.8 · zod · npm 11.17 (Node 24).

**Spec:** `C:\Users\Diego\.cursor\projects\c-Users-Diego-Documents-ClinicaOS-patronus-flow\canvases\clinica-os-security-audit.canvas.tsx` — relatório da auditoria com os 35 achados (C1–C2, A1–A8, M1–M14, B1–B11), arquivo:linha, risco e correção proposta. Este plano argumenta a partir dele; execute os dois juntos.

## Global Constraints

- **Diretório de trabalho:** `C:\Users\Diego\Documents\ClinicaOS\patronus-flow` (branch `main`, HEAD `c498704`, remoto `github.com/Diego-de-Melo/patronus-flow-a538fe93`). O clone em `Temp\opencode\repos` é só o espelho da auditoria — não editar.
- **Não versionar** `.env`; **não tocar** em `supabase/diagnostic.sql` (arquivo não versionado do usuário, deixá-lo intacto e fora dos commits).
- **Verificação obrigatória** ao fim de *cada bloco*: `npx tsc --noEmit` → `npm run lint` → `npm test` → `npm run build`. Bloco só é commitado com os quatro verdes (registrar falha pré-existente antes de começar a T1 e não contá-la como regressão).
- **Testes de RLS** usam `npm run test:rls` (arquivo próprio `vitest.config.rls.ts`) e **não** entram em `npm test` — CI/contribuidor sem Docker continua verde.
- **Commit messages:** Conventional Commits, prefixo em inglês (`security:`, `fix:`, `feat(lgpd):`, `chore:`), como a história existente. **Um commit por bloco** (11 blocos, definidos no fim do plano). Sem `--amend` depois de push.
- **Push único, ao final (T22), só após confirmação explícita do Diego.** Nenhum `git push` antes disso.
- **Migrations:** nome `supabase/migrations/AAAAMMDDHHMMSS_descricao.sql` com timestamps sequenciais a partir de `20260927000100`, ordem lexicográfica respeitada (a última migration vence).
- **Sem novas dependências de runtime** sem justificativa explícita no passo. Dev-dependências só se o passo nomear.
- **Idioma:** mensagens de erro e comentários em PT-BR (padrão do repositório).
- **Deploy de SQL é manual:** não há `SUPABASE_ACCESS_TOKEN` nem Docker na nuvem — as migrations são aplicadas no banco de produção pelo Diego, em `Lovable → More → Cloud → SQL editor`. O plano entrega o SQL pronto; a aplicação fica registrada em T22.

## Review Focus

Estas cinco condições são as mais prováveis de quebrar algo que nenhum teste do plano cobre. Cada linha indica a task dona e o teste que a prende.

1. **Recusar e-mail já existente (C2) pode quebrar o reenvio de convite.** Espera-se que o admin ainda consiga reenviar convite para o mesmo e-mail. → T3: teste unitário `joinDecision()` cobrindo `profile === null`, `clinic_id` nulo e `clinic_id` de outra clínica, e passo manual de "Reenviar convite" em `_app/equipe.tsx`.
2. **`requireActiveClinic` (A2) pode bloquear o super_admin**, que tem `clinic_id` nulo e clínica inexistente. Espera-se que super_admin passe sempre. → T8: teste `evaluateClinicAccess()` com caso `role=super_admin` e teste do middleware com `context.role` mockado.
3. **`REVOKE` de privilégios para `anon` (A7) pode derrubar tela pré-login** (ex.: `aceitar-convite` lendo algo sem sessão). Espera-se que login, convite e recuperação de senha continuem funcionando. → T5: passo de grep obrigatório por consultas executadas antes da sessão antes de escrever a migration; se houver, revogar só `TRUNCATE/REFERENCES` e manter `SELECT` de `anon`.
4. **Migrar sessão para cookie httpOnly (M3) pode quebrar a autenticação SSR** (`auth-middleware` lê `Authorization`). Espera-se que server functions continuem autenticadas e a sessão persista entre reloads. → T19: teste de parse do cookie + passo manual de login/reload/logout registrado; commit próprio para revert pontual.
5. **`handle_new_user` sem `raw_user_meta_data` (A8) pode deixar perfis sem `clinic_id`** se `ensureClinicProfile` não rodar em algum caminho. Espera-se que criar membro via `createTeamMember` ainda gere perfil com tenant. → T5: teste de integração que cria usuário pelo fluxo de equipe e lê `profiles.clinic_id` da sessão.
   - *bônus:* **CSP estrito (M9) pode quebrar UI** (Radix inline styles, fontes do Google). → T17: CSP aplicada **apenas em produção**, com toggle `CSP_REPORT_ONLY`, e verificação por `HEAD` contra produção em T22.

---

## Task 1 — Harness de testes de integração de RLS (base do M10)

**Files:**
- Create: `tests/rls/helpers.ts`, `tests/rls/baseline.test.ts`, `vitest.config.rls.ts`, `docs/testing-rls.md`
- Modify: `package.json` (scripts), `docs/superpowers/plans/` (não versionado — só referencia)

**Interfaces:**
- Consumes: Supabase CLI 2.106.0 + `supabase/config.toml` (projeto `klwqeycfdfeulqrwngky`), Docker Desktop recém-instalado.
- Produces: `startStack()` → `{ url, anonKey, serviceKey }`; `createTenant(name)` → `{ clinicId, userId, user }` com sessão autenticada via `supabase.auth.signInWithPassword`; `signIn(role, clinic)` → cliente `SupabaseClient` com JWT do usuário. Exporta `resetStack()` (truncate + seed de 2 clínicas).

- [ ] **Step 1: Rodar os comandos de verificação de base e registrar o resultado**
  Run: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`
  Expected: resultado registrado em comentário no topo do plano (falha pré-existente não é regressão). Se `npm test` falhar por dependência não instalada, `npm ci` antes.

- [ ] **Step 2: Confirmar o Docker de pé**
  Run: `docker info --format '{{.ServerVersion}}'`
  Expected: versão impressa. Se o daemon não subiu, iniciar Docker Desktop e reexecutar (instalação já autorizada pelo Diego).

- [ ] **Step 3: Escrever `tests/rls/helpers.ts`** com `startStack()`/`createTenant()`/`resetStack()` conforme a Interfaces. Chaves vêm de `supabase status --override-name` (`API URL`, `anon key`, `service_role key`), lidas de `process.env.SUPABASE_TEST_URL/ANON_KEY/SERVICE_KEY` com fallback para parse da saída.

- [ ] **Step 4: Escrever `tests/rls/baseline.test.ts`** (3 casos que devem passar **antes** de qualquer correção — provam que o harness mede de verdade):
  - `anon não lê patients/attendances/clinics/audit_logs/backups/profiles` → `select("*")` retorna `0` linhas em todas.
  - `sessão da clínica A não lê patients da clínica B` → `0` linhas.
  - `sessão da clínica A lê o próprio patient` → `1` linha (prova que o harness não está só negando tudo).

- [ ] **Step 5: Criar `vitest.config.rls.ts`** (include `tests/rls/**/*.test.ts`, `testTimeout: 120000`, `pool: "forks"`, `fileParallelism: false`) e o script `"test:rls": "vitest run --config vitest.config.rls.ts"` em `package.json`. `npm test` (unit) permanece inalterado.

- [ ] **Step 6: Subir a stack e aplicar as migrations existentes**
  Run: `supabase start` e depois `supabase db reset`
  Expected: 26 migrations aplicadas sem erro. Exportar as três variáveis no mesmo shell do teste.

- [ ] **Step 7: Rodar a suíte base**
  Run: `npm run test:rls`
  Expected: 3 testes PASS. Se `sessão da clínica A lê o próprio patient` falhar, o helper de criação está errado — corrigir o helper, não o teste.

- [ ] **Step 8: Escrever `docs/testing-rls.md`** com o passo a passo (`docker up` → `supabase start` → `supabase db reset` → `SUPABASE_TEST_URL=... npm run test:rls`) e o que a suíte garante.

---

## Task 2 — C1: `soft_delete_attendance` sem filtro de tenant

**Files:**
- Create: `supabase/migrations/20260927000100_soft_delete_attendance_tenant.sql`, `tests/rls/soft-delete.test.ts`
- Modify: `src/lib/attendances.functions.ts:~178` (consumidor da RPC)

**Interfaces:**
- Consumes: helpers da T1 (`createTenant`, `resetStack`).
- Produces: `public.soft_delete_attendance(p_id uuid) RETURNS boolean` — `true` só quando o atendimento pertence à clínica do chamador, clínica está ativa e papel é `admin`/`operador`; `false` nos demais casos (nunca exceção, para não vazar existência de id).

- [ ] **Step 1: Escrever o teste que falha**
  `tests/rls/soft-delete.test.ts` → `describe("soft_delete_attendance")`:
  - `admin da clínica A apaga atendimento da A` → `rpc` retorna `true` e `deleted_at` preenchido.
  - `admin da clínica B apaga atendimento da A` → retorna **`false`** e `deleted_at` continua `null`.
  - `usuario (papel não assistencial) da clínica A apaga da A` → `false`.
  - `clínica inativa` → `false`.

- [ ] **Step 2: Rodar e confirmar a falha**
  Run: `npm run test:rls -- soft-delete`
  Expected: **FAIL** no caso cross-tenant (hoje a função apaga qualquer `id`) — é a prova do vazamento.

- [ ] **Step 3: Escrever a migration `20260927000100_soft_delete_attendance_tenant.sql`**
  ```sql
  DROP FUNCTION IF EXISTS public.soft_delete_attendance(uuid);
  CREATE OR REPLACE FUNCTION public.soft_delete_attendance(p_id uuid)
  RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
  AS $$
  DECLARE
    _cid  uuid := public.current_clinic_id();
    _role public.app_role := public."current_role"();
  BEGIN
    IF _cid IS NULL OR NOT public.is_clinic_active() THEN RETURN FALSE; END IF;
    IF _role NOT IN ('admin', 'operador') THEN RETURN FALSE; END IF;
    UPDATE public.attendances
       SET deleted_at = now()
     WHERE id = p_id AND clinic_id = _cid AND deleted_at IS NULL;
    RETURN FOUND;
  END $$;
  REVOKE ALL ON FUNCTION public.soft_delete_attendance(uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.soft_delete_attendance(uuid) TO authenticated;
  ```
  `DROP` é obrigatório: PostgreSQL não troca tipo de retorno com `CREATE OR REPLACE` (void → boolean).

- [ ] **Step 4: Resetar e rodar o teste**
  Run: `supabase db reset` e depois `npm run test:rls -- soft-delete`
  Expected: 4 testes PASS.

- [ ] **Step 5: Fazer o consumidor checar o retorno**
  Em `attendances.functions.ts`, depois do `rpc("soft_delete_attendance", { p_id })`: se `data !== true`, `throw new Error("Atendimento não encontrado.")`. Hoje só o `error` é verificado, então um `false` viraria sucesso silencioso.

- [ ] **Step 6: Verificação**
  Run: `npx tsc --noEmit && npm test`
  Expected: ambos verdes.

---

## Task 3 — C2: takeover de conta em `createTeamMember`

**Files:**
- Create: `src/lib/team-join.ts` (lógica pura), `src/lib/team-join.test.ts`
- Modify: `src/lib/team.functions.ts:35-46` (`assertUserCanJoinClinic`) e `:118-143` (caminho "e-mail já registrado")

**Interfaces:**
- Produces: `joinDecision(profile: { clinic_id: string | null } | null): { mode: "attach" } | { mode: "reject"; reason: string }` — `attach` **somente** quando `profile === null`; qualquer perfil existente rejeita, inclusive `clinic_id` nulo (é o caso do super_admin).

- [ ] **Step 1: Teste que falha**
  `src/lib/team-join.test.ts`:
  - `profile === null` → `{ mode: "attach" }`
  - `profile.clinic_id === null` (super_admin) → `reject` com motivo citando "Reenviar convite"
  - `profile.clinic_id === outraClínica` → `reject`
  - `profile.clinic_id === clínica do chamador` → `reject` (já é membro — hoje também rejeita)
  Run: `npx vitest run src/lib/team-join.test.ts` → **FAIL** (módulo não existe).

- [ ] **Step 2: Implementar `joinDecision` em `src/lib/team-join.ts`** conforme a Interfaces.

- [ ] **Step 3: Trocar `assertUserCanJoinClinic` para usá-lo**
  Passa a lançar quando `mode === "reject"`; a mensagem diz: "Este e-mail já possui cadastro. Peça ao administrador para reenviar o convite ou use 'Esqueci minha senha'." Nenhum `updateUserById` deve ser alcançado com `mode === "reject"`.

- [ ] **Step 4: Garantir que o ramo perigoso sumiu**
  Em `team.functions.ts:118-143`, mover a chamada `updateUserById(...)` para depois de `assertUserCanJoinClinic` **e** adicionar guarda explícita `if (profile) throw` antes. Remover `password` do `updateUserById` se ele ainda for usado no caminho `attach` — o caminho `attach` só faz `ensureClinicProfile`.

- [ ] **Step 5: Verificação**
  Run: `npx vitest run src/lib/team-join.test.ts && npx tsc --noEmit && npm test`
  Expected: verdes. Passo manual registrado (sem executar em produção): conferir em `_app/equipe.tsx` que o botão "Reenviar convite" existe para membros já cadastrados.

---

## Task 4 — M14: escritas com conferência explícita de tenant

**Files:**
- Modify: `src/lib/patients.functions.ts:108-136`, `src/lib/attendances.functions.ts:97-122`
- Test: `tests/rls/tenant-writes.test.ts`

**Interfaces:**
- Consumes: helpers da T1.
- Produce: padrão em toda escrita por id — `.eq("id", id).eq("clinic_id", prof.clinic_id).select("id")` e `if (!data?.length) throw new Error("Registro não encontrado.")`. Em `createAttendance`, `patient_id` é conferido com `select("id").eq("id", ...).eq("clinic_id", prof.clinic_id).maybeSingle()` antes do insert.

- [ ] **Step 1: Teste que falha (mostra o `ok:true` enganoso)**
  `tests/rls/tenant-writes.test.ts`:
  - `updatePatient com id da clínica B` → hoje retorna `{ ok: true }` sem alterar nada → teste espera **lançamento** de `"Registro não encontrado."`
  - `deletePatient com id da clínica B` → idem
  - `updateAttendance com id da clínica B` → idem
  - `createAttendance apontando patient_id da clínica B` → espera lançamento `"Paciente não encontrado."`
  Run: `npm run test:rls -- tenant-writes` → **FAIL**.

- [ ] **Step 2: Implementar** as quatro checagens conforme a Interfaces.

- [ ] **Step 3: Rodar**
  Run: `supabase db reset && npm run test:rls -- tenant-writes` → PASS.

- [ ] **Step 4: Verificação**
  Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`

- [ ] **Step 5: Commit do Bloco A** (T1–T4)
  ```
  security: add RLS integration harness and fix cross-tenant writes (C1, C2, M14)
  ```

---

## Task 5 — A7 + A8 + B1 + B2: privilégios e gatilhos

**Files:**
- Create: `supabase/migrations/20260927000200_privileges_and_triggers.sql`, `tests/rls/privileges.test.ts`
- Modify: `AGENTS.md` (checklist de segurança)

**Interfaces:**
- Produces: (a) `anon` sem `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES` em `public.*` (mantém `SELECT`, anulado pelo RLS); (b) `handle_new_user()` sem leitura de `raw_user_meta_data` — sempre `role = 'usuario'`, `clinic_id = NULL`, exceção se o metadata tentar trazer `role`/`clinic_id`; (c) `SET search_path` endurecido nas 10 funções `SECURITY DEFINER`; (d) `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ... FROM PUBLIC, anon`.

- [ ] **Step 1: Grep de dependência de `anon` (decide o formato do REVOKE)**
  Run: `git grep -n "supabase.auth\." -- src | Select-String -Context 0` e procurar qualquer `.from(` executado sem sessão (`aceitar-convite`, `login`, `bloqueio`).
  Expected: nenhuma leitura de tabela pública. Se houver, **manter `SELECT` de `anon`** (plano prevê manter de qualquer forma) e não reverter mais nada.

- [ ] **Step 2: Testes que falham**
  `tests/rls/privileges.test.ts`:
  - `anon não consegue INSERT em patients` → erro de privilégio/negado
  - `signup com raw_user_meta_data.role = super_admin` → perfil criado com `role = 'usuario'` e `clinic_id` nulo
  - `createTeamMember cria perfil com clinic_id da clínica` (fecha a Review Focus 5)
  - `anon não consegue EXECUTE em dashboard_summary/log_audit` → `404 PGRST202`
  Run: `npm run test:rls -- privileges` → **FAIL** (hoje `anon` tem DML por default privilege).

- [ ] **Step 3: Escrever a migration** com quatro blocos:
  - `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon;` + o mesmo em `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public`.
  - Recriar `handle_new_user()` sem `current_setting('request.jwt.claims')` e sem `raw_user_meta_data`: `INSERT INTO public.profiles(id, email, role, clinic_id) VALUES (NEW.id, NEW.email, 'usuario', NULL)`; `RAISE` se `NEW.raw_user_meta_data` contiver `role` ou `clinic_id` (sinaliza tentativa).
  - Recriar as 10 funções `SECURITY DEFINER` com `SET search_path = ''` quando o corpo já referencia tudo como `public.x`, senão `SET search_path = public, pg_temp` — anotar qual foi usada em cada uma no corpo do commit.
  - `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;` + `REVOKE EXECUTE ON FUNCTION <as 10> FROM PUBLIC, anon;`

- [ ] **Step 4: Rodar**
  Run: `supabase db reset && npm run test:rls -- privileges`
  Expected: PASS. Se `supabase db reset` falhar, a migration tem erro de sintaxe/dependência — corrigir antes de seguir.

- [ ] **Step 5: Checklist em `AGENTS.md`** (fecha o B3, sem `FORCE ROW LEVEL SECURITY` — ele quebraria `handle_new_user`/`dashboard_summary`, que rodam como dono das tabelas)
  Item novo: "Toda função `SECURITY DEFINER` nova precisa (1) predicado de `clinic_id`, (2) `search_path` explícito, (3) `REVOKE FROM PUBLIC, anon` na mesma migration, (4) teste em `tests/rls/`."

---

## Task 6 — A6 + M8 + M11 + M12 + M13 + B4 + B5 + B6(SQL): políticas

**Files:**
- Create: `supabase/migrations/20260927000300_policies_tenant_role.sql`, `tests/rls/policies.test.ts`

**Interfaces:**
- Produces: predicates finais (a última migration vence) —
  - **A6:** `patients_delete_writer` e `attendances_delete_writer` com `current_role() = 'admin'` apenas (remove `'operador'`).
  - **M8:** `consents_insert` com `WITH CHECK (user_id = auth.uid() AND clinic_id = current_clinic_id())`; `consents_update_self` limitado à coluna `revoked_at` (`REVOKE UPDATE ON public.consents FROM authenticated; GRANT UPDATE (revoked_at) ON public.consents TO authenticated;`).
  - **M11:** `UNIQUE (id, clinic_id)` em `patients` + `FOREIGN KEY (patient_id, clinic_id) REFERENCES patients(id, clinic_id)` em `attendances`.
  - **M12:** `patients_select` e `attendances_select` ganham `AND "current_role"() IN ('admin','operador','usuario')` (contador deixa de ler prontuário).
  - **M13:** `audit_logs_delete_superadmin` recriada com `TO authenticated`.
  - **B4:** `audit_logs_select`, `consents_select`, `backup_configs_select`, `backups_select` ganham `AND (is_super_admin() OR is_clinic_active())`.
  - **B5:** policies de `storage.objects` de update/delete cobrem também `tmp/<clinic>/`.
  - **B6:** `log_audit` valida `_action ~ '^[a-z]+(\.[a-z_]+)+$'` e `length(_action) <= 80`.

- [ ] **Step 1: Checar dados existentes que podem travar o M11**
  Run: consulta contando atendimentos com `patient_id` cujo paciente tem `clinic_id` diferente.
  Expected: `0`. Se > 0, **parar** e reportar as linhas ao Diego antes de aplicar (a migration falharia e corrigir dado clínico é decisão dele).

- [ ] **Step 2: Testes que falham**
  `tests/rls/policies.test.ts` (10 casos):
  - `operador NÃO consegue DELETE patients` / `consegue UPDATE`
  - `INSERT de consentimento apontando clínica alheia` → negado
  - `UPDATE de consents alterando granted_at` → negado; `revoked_at` → permitido
  - `createAttendance com patient de outra clínica` → erro de FK
  - `contador não lê patients` → `0` linhas; `admin lê` → > 0
  - `anon NÃO consegue DELETE em audit_logs` → erro
  - `clínica expirada não lê audit_logs/consents` → `0` linhas; `super_admin lê` → ok
  - `log_audit com action malformada` (`"DROP TABLE x"`) → erro
  Run: `npm run test:rls -- policies` → **FAIL**.

- [ ] **Step 3: Escrever a migration** conforme a Interfaces, na ordem: dados → constraints → policies (recriar inteira, não amendar) → storage → função `log_audit`.

- [ ] **Step 4: Rodar**
  Run: `supabase db reset && npm run test:rls -- policies`
  Expected: 10 PASS.

- [ ] **Step 5: Regressão geral da suíte**
  Run: `npm run test:rls`
  Expected: todos PASS (soft-delete, tenant-writes, privileges, policies, baseline).
  ⚠️ Se o caso `contador não lê patients` quebrar alguma tela de faturamento, é comportamento esperado pelo achado M12 — registrar no relatório final.

- [ ] **Step 6: Commit do Bloco B** (T5–T6)
  ```
  security: revoke anon DML, pin tenant predicates and role scopes in RLS (A6-A8, M8, M11-M13, B1-B6)
  ```

---

## Task 7 — A1: webhook de backup com segredo dedicado

**Files:**
- Create: `src/lib/hook-auth.ts`, `src/lib/hook-auth.test.ts`
- Modify: `src/routes/api/public/hooks/run-clinic-backups.ts:8-15`, `.env.example`

**Interfaces:**
- Produces: `isAuthorizedHook(authHeader: string | null, secret: string | undefined): boolean` — `false` quando `secret` ausente/vazia (fail closed), quando o header não casa com `Bearer `, ou quando o `timingSafeEqual` dos buffers de mesmo tamanho falha (`Buffer.from(...).length` deve ser conferido antes, pois `timingSafeEqual` lança em tamanhos distintos).

- [ ] **Step 1: Testes que falham**
  `src/lib/hook-auth.test.ts`: secret ausente → `false`; header `null` → `false`; `Bearer errado` → `false`; `Bearer certo` → `true`; mesmo prefixo com 1 byte diferente → `false`; tamanhos diferentes → `false` sem lançar.
  Run: `npx vitest run src/lib/hook-auth.test.ts` → FAIL (arquivo não existe).

- [ ] **Step 2: Implementar `isAuthorizedHook`** com `timingSafeEqual` de `node:crypto`.

- [ ] **Step 3: Trocar a rota**: `const expected = process.env.BACKUP_HOOK_SECRET; return isAuthorizedHook(request.headers.get("authorization"), expected) ? null : new Response("Unauthorized", { status: 401 })`. Remover o uso de `SUPABASE_SERVICE_ROLE_KEY` como senha.

- [ ] **Step 4: `.env.example`**: adicionar `BACKUP_HOOK_SECRET=` com comentário "`openssl rand -base64 32`; é o segredo que o agendador envia no header `Authorization: Bearer …` — **não** é a service_role key" e marcar `SUPABASE_SERVICE_ROLE_KEY` como "somente servidor, nunca em URL/hook".

- [ ] **Step 5: Verificação e nota de operação**
  Run: `npx vitest run src/lib/hook-auth.test.ts && npx tsc --noEmit && npm test`
  Expected: verdes. Registrar em `docs/testing-rls.md` (ou no PR): **se houver agendador externo apontando para `/api/public/hooks/run-clinic-backups` com a service_role key, ele precisa passar a enviar `BACKUP_HOOK_SECRET`** — sem isso o backup automático para (o Diego confirma se existe agendador em T22).

---

## Task 8 — A2: `requireActiveClinic`

**Files:**
- Create: `src/lib/clinic-access.ts`, `src/lib/clinic-access.test.ts`
- Modify: `src/lib/auth-guards.ts` (novo middleware), `src/lib/backups.functions.ts` (5 fns), `src/lib/team.functions.ts` (4 fns)

**Interfaces:**
- Produces: `evaluateClinicAccess(args: { status: string; expirationDate: string | null; role: string; now?: number }): { active: boolean; reason?: string }` — `role === "super_admin"` → `{ active: true }` incondicionalmente; senão `status !== "ativo"` ou `expirationDate < now` → `{ active: false, reason }`.
  Middleware: `requireActiveClinic` (encadeia `requireSupabaseAuth`, lê `status`/`expiration_date` de `clinics` pelo `clinic_id` do perfil, lança `"Clínica inativa ou vencida."` quando inativo).

- [ ] **Step 1: Testes que falham** (`src/lib/clinic-access.test.ts`): ativo+futura → ativo; ativo+passada → bloqueado; `inativo` → bloqueado; `super_admin` com datas nulas → ativo; `now` fixo (`new Date("2026-01-01")`) para não depender de relógio.

- [ ] **Step 2: Implementar** `evaluateClinicAccess` e o middleware `requireActiveClinic` em `auth-guards.ts`, seguindo o padrão dos guards existentes.

- [ ] **Step 3: Aplicar nas 9 server functions** — `listBackups`, `getBackupConfig`, `generateBackupNow`, `getBackupDownloadUrl`, `restoreBackup` (backups) e `createTeamMember`, `updateTeamMemberRole`, `removeTeamMember`, `deleteTeamUser` (team): `.middleware([requireClinicAdmin, requireActiveClinic])` (ou o middleware de sessão que já usarem + este).

- [ ] **Step 4: Teste de integração do bypass de super_admin** em `tests/rls/` (fecha Review Focus 2): clínica inativa + sessão `super_admin` consegue chamar `listBackups`; sessão `admin` da clínica inativa lança erro.

- [ ] **Step 5: Verificação** — Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`

---

## Task 9 — A3: PII redigida antes do insert em `audit_logs`

**Files:**
- Create: `src/lib/audit-redact.ts`, `src/lib/audit-redact.test.ts`
- Modify: `src/lib/audit.server.ts:27-34` (aplicar antes do insert), `src/lib/audit.functions.ts:9-41` (importar do lugar novo em vez de duplicar)

**Interfaces:**
- Produces: `redactMetadata(input: Record<string, unknown>): Record<string, unknown>` — remove/anonimiza `name`, `nome`, `cpf`, `cnpj`, `father_cpf`, `mother_cpf`, `responsible_cpf`, `email`, `admin_email`, `ip`, `user_agent`; CPF/CNPJ viram `sha256(valor).slice(0, 12)` prefixado com `hash:`; preserva `id`, `clinic_id`, `record_id`, `status`, `action`.

- [ ] **Step 1: Testes que falham**: CPF crudo some e vira `hash:` + 12 hex; `name` some; `record_id` permanece; entrada `undefined`/`null` volta `{}`; aninhamento de 1 nível copiado e limpo.

- [ ] **Step 2: Implementar `redactMetadata`** (mover a lógica existente de `audit.functions.ts` e reutilizar — DRY).

- [ ] **Step 3: Aplicar em `audit.server.ts`** antes do `rpc("log_audit", { ..., _metadata: redactMetadata(...) })` — toda auditoria interna passa por lá.

- [ ] **Step 4: Verificação** — `npx vitest run src/lib/audit-redact.test.ts && npx tsc --noEmit && npm test`.

---

## Task 10 — A4: remover `logAudit` exposta

**Files:**
- Modify: `src/lib/audit.functions.ts:50-78` (deletar `logAudit`)
- Test: `src/lib/audit.functions.test.ts` (novo) — cobre o que sobra

- [ ] **Step 1: Confirmar que é código morto** — Run: `git grep -n "logAudit\b" -- src` e `git grep -n "audit.functions" -- src`.
  Expected: só a definição e o import do módulo; **nenhuma rota** chama. Se houver chamador, parar e reportar (não remover sem refatorar o chamador).

- [ ] **Step 2: Deletar `logAudit`** e manter `logAuditInternal` (usada pelas rotas).

- [ ] **Step 3: Teste de regressão** — `src/lib/audit.functions.test.ts` valida `assertSuperAdminRole` e o schema de input restante; inclui um teste que garante que o export do módulo **não** contém `logAudit` (impede regressão silenciosa).

- [ ] **Step 4: Verificação** — `npx tsc --noEmit && npm run lint && npm test`

- [ ] **Step 5: Commit do Bloco C** (T7–T10)
  ```
  security: dedicated webhook secret, active-clinic gate, audit redaction, drop open logAudit (A1-A4)
  ```

---

## Task 11 — M5: schema de restauração de backup

**Files:**
- Create: `src/lib/backup-restore.schema.ts`, `src/lib/backup-restore.schema.test.ts`
- Modify: `src/lib/backups.functions.ts:173-217`

**Interfaces:**
- Produces: `parseBackupSnapshot(raw: unknown): Snapshot` — zod com allowlist por tabela (`id` uuid obrigatório, campos conhecidos de `patients`/`attendances`/`clinics`/`profiles`), **`clinic_id` proibido em qualquer linha** (`z.never()`/`.strict()`), arrays limitados a 50 000 itens; lança erro com mensagem clara fora do shape.

- [ ] **Step 1: Testes que falham**: snapshot válido → parseia; linha com `clinic_id` extra → rejeitada; campo desconhecido `role` → rejeitado; array com 50 001 itens → rejeitado; `id` inválido → rejeitado.
- [ ] **Step 2: Implementar o schema** e trocar o `JSON.parse + spread + upsert` por `parseBackupSnapshot(JSON.parse(...))` + montagem de payload por allowlist antes do `upsert`.
- [ ] **Step 3: Verificação** — `npx vitest run src/lib/backup-restore.schema.test.ts && npx tsc --noEmit && npm test`.

---

## Task 12 — M6: download de backup sem plaintext no bucket

**Files:**
- Modify: `src/lib/backups.server.ts:156-187` (`createSignedTempDownload`), `src/lib/backups.functions.ts` (`getBackupDownloadUrl`), `src/routes/_app/backups.tsx:75` (`window.open`)
- Create: `src/lib/backup-download.test.ts`

**Interfaces:**
- Produces: `backupDownloadHeaders(filename: string): Record<string, string>` → `{ "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="…"', "Cache-Control": "no-store" }`; `sanitizeBackupFilename(clinicId, backupId): string` (só `[a-zA-Z0-9._-]`).
  Server function `downloadBackup(backupId)` devolve `new Response(decryptedBuffer, { headers: backupDownloadHeaders(...) })`. O cliente passa a baixar via `fetch` da própria server function e `URL.createObjectURL` — **nenhum objeto em claro é gravado no Storage**; `createSignedTempDownload` é removido junto com o `window.open`.

- [ ] **Step 1: Testes que falham**: headers corretos com aspas escapadas; filename com `../` ou `"` neutralizados; `downloadBackup` não referencia `storage.upload` (teste de integração no `tests/rls/` lendo que o prefixo `tmp/` não é usado — ou, mais simples, teste unitário do construtor de headers + grep assertion documentada no passo 4).
- [ ] **Step 2: Implementar** `downloadBackup` server function + helpers, e trocar o fluxo do cliente.
- [ ] **Step 3: Garantir escopo de tenant** — `downloadBackup` confere `bk.clinic_id === profile.clinic_id` (já existe em `downloadAndDecrypt`; manter) e `requireActiveClinic` (T8).
- [ ] **Step 4: Verificação** — `git grep -n "createSignedTempDownload"` → sem ocorrências; `npx tsc --noEmit && npm test && npm run build`.

---

## Task 13 — B7 + B8: criptografia de backup compatível com dados existentes

**Files:**
- Modify: `src/lib/backup-crypto.server.ts`, `.env.example`
- Create: `src/lib/backup-crypto.server.test.ts`

**Interfaces:**
- Produces: `encryptBuffer(plaintext, aad: string)` com `cipher.setAAD(Buffer.from(aad))`; `decryptBuffer(ciphertext, iv, tag, aad)` com **fallback**: tenta com AAD e, se o GCM falhar, tenta sem (backups antigos foram gravados sem AAD — a tag de autenticação continua valendo nos dois casos).
  AAD fixo: `` `${clinicId}:${objectPath}` `` — impede troca de backup entre clínicas.
  `getKey()`: se o valor parsear como 32 bytes (hex de 64 ou base64 válido) → usar direto; senão → **comportamento legado** (utf8 + sha-256 se < 32) **com `console.warn`** orientando `openssl rand -hex 32`. Nunca lançar sobre chave já em uso.
  Checksum: `checksum = hmac-sha256(key, ciphertext)` (não mais sha-256 do plaintext); na verificação aceitar **o valor legado** (sha-256 do plaintext) **ou** o novo HMAC, para não invalidar backups antigos.

- [ ] **Step 1: Conferir quem usa o checksum** — Run: `git grep -n "checksum" -- src supabase`. Se houver verificação em leitura, manter aceitação dupla (requisito acima); se só escrita, trocar direto.
- [ ] **Step 2: Testes que falham**: roundtrip com AAD; decrypt de "legado" (payload gravado sem AAD) → funciona; tentativa de decrypt com AAD de outra clínica → **falha** (prova do ganho); chave hex 64 → sem aviso; chave passphrase → aviso + roundtrip ainda funciona; HMAC aceito e sha-256 legado aceito.
- [ ] **Step 3: Implementar** conforme a Interfaces (criptografia antiga precisa continuar legível — é o requisito número 1 desta task).
- [ ] **Step 4: `.env.example`** — documentar `BACKUP_ENCRYPTION_KEY=$(openssl rand -hex 32)` e o formato preferido.
- [ ] **Step 5: Verificação** — `npx vitest run src/lib/backup-crypto.server.test.ts && npx tsc --noEmit && npm test`.

---

## Task 14 — A5 + M7: LGPD de verdade

**Files:**
- Modify: `src/lib/lgpd.functions.ts` (corrigir `anonymizePatient`, usar `exportPatientData`), `src/lib/patients.functions.ts:120-136`, `src/lib/clinics.functions.ts:179-199`, `src/routes/_app/pacientes.$id.tsx` (UI), `src/lib/audit.server.ts` (logar a erasure)
- Create: `src/lib/lgpd-anonymize.ts`, `src/lib/lgpd-anonymize.test.ts`

**Interfaces:**
- Produces: `anonymizePatch(row: PatientRow): Partial<PatientRow>` — zera/anonimiza **todos**: `name`, `cpf`, `father_name/cpf`, `mother_name/cpf`, `cnpj`, `company_name`, `responsible_name`, `responsible_cpf`, `phone`, `address`, `email`; preserva `id`, `clinic_id`, `deleted_at`.
  Server fns novas/corrigidas: `exportPatientData(backupId?)` → JSON com pacientes + atendimentos do tenant (já existe, precisa ser chamada), `anonymizePatient(patientId)` → aplica patch + desvincula `attendances.patient_id` (`null` apenas se a constraint permitir; caso contrário apaga os atendimentos do paciente) + redigie `audit_logs.metadata` do tenant referentes ao `record_id`.
  `deleteClinic` ganha limpeza: `audit_logs`, `consents` (sem FK com cascade) e `supabaseAdmin.storage.from("clinic-backups").list(clinicId)` → `remove()`.

- [ ] **Step 1: Testes que falham** — `anonymizePatch` cobre **todos** os campos da lista (um teste por grupo: dados pessoais, dados dos pais, dados empresariais) e preserva `id`/`clinic_id`.
- [ ] **Step 2: Implementar `anonymizePatch`** e corrigir `lgpd.functions.ts:52-59` para usá-lo.
- [ ] **Step 3: Testes para a limpeza da clínica** — `deleteClinic` limpa `audit_logs` e `consents` do tenant e remove a pasta no Storage (mock de `supabaseAdmin`).
- [ ] **Step 4: Ligar na UI** — em `pacientes.$id.tsx`, seção "Direitos do titular": botão **Exportar dados (JSON)** que baixa via `exportPatientData` e botão **Anonimizar cadastro** com confirmação em duas etapas (digitar o nome do paciente), ambos chamando as server functions e registrando `patient.anonymize`/`patient.export` na auditoria.
- [ ] **Step 5: Verificação** — `npx tsc --noEmit && npm run lint && npm test && npm run build`.

- [ ] **Step 6: Commit do Bloco D** (T11–T13) e **Bloco E** (T14) — dois commits:
  ```
  security: schema-validate backup restore, stream decrypted download, bind backup AEAD to clinic (M5, M6, B7, B8)
  feat(lgpd): real erasure/export flows and clinic data cleanup (A5, M7)
  ```

---

## Task 15 — M1: guards de rota no servidor + documentação corrigida

**Files:**
- Modify: `src/routes/master-admin.tsx` (~103-112), `src/routes/master-admin.logs.tsx` (~76-81), `src/routes/_app/__root.tsx`/layout de `_app` (guard de sessão), `src/lib/route-auth.ts` (colocar em uso), `README.md`, `README.en.md`, `AGENTS.md`
- Create: `src/lib/route-auth.test.ts`

**Interfaces:**
- Consumes: `requireAppSession()`, `requireSuperAdminSession()` de `route-auth.ts` (hoje código morto).
- Produce: `beforeLoad` em `master-admin`, `master-admin.logs` e no layout `_app` que chama essas funções e `throw redirect({ to: "/login" })` em caso de falha.

- [ ] **Step 1: Testes que falham** — `route-auth.test.ts`: `requireSuperAdminSession` lança (→ redirect) sem sessão; `requireAppSession` lança com clínica bloqueada (usa `evaluateClinicAccess` da T8 — DRY).
- [ ] **Step 2: Implementar os `beforeLoad`** nos três pontos; manter as checagens de React como defesa em profundidade.
- [ ] **Step 3: Corrigir a documentação** — `README.md`/`README.en.md` linha que descreve proteção de rotas e `AGENTS.md:52`: dizer que a autorização real está nas server functions + RLS, e que `beforeLoad` é barreira de UX.
- [ ] **Step 4: Verificação** — `npx tsc --noEmit && npm run lint && npm test && npm run build`.

---

## Task 16 — M4 (CSV) + B6 (redirectTo)

**Files:**
- Create: `src/lib/csv.ts`, `src/lib/csv.test.ts`
- Modify: `src/routes/master-admin.logs.tsx:83-107`, `src/lib/clinics.functions.ts:69,114`

**Interfaces:**
- Produces: `csvCell(value: unknown): string` → aspas + escape de `"` **e** prefixo `'` quando o valor começa com `=`, `+`, `-`, `@`, tab ou CR. `assertAllowedRedirect(url: string, allowedOrigins: string[])` → lança se `new URL(url).origin` fora da lista (`process.env.APP_ORIGIN` + `VITE_*`), com fallback para `${origin}/aceitar-convite` quando não informado.

- [ ] **Step 1: Testes que falham** — `csvCell("=" + "HYPERLINK(...)")` → começa com `'=;` `csvCell("a\"b")` → `a""b` entre aspas; valor comum → sem prefixo; `assertAllowedRedirect("https://evil.com/x", ["https://app"])` → lança; origin permitida → ok.
- [ ] **Step 2: Implementar** e trocar o `exportCSV` para usar `csvCell` em todas as colunas; trocar `redirectTo: z.string().url()` por `.superRefine` chamando `assertAllowedRedirect` nas duas funções de convite.
- [ ] **Step 3: `.env.example`** — `APP_ORIGIN=https://patronus-flow.lovable.app`.
- [ ] **Step 4: Verificação** — `npx vitest run src/lib/csv.test.ts && npx tsc --noEmit && npm test`.

---

## Task 17 — M9: cabeçalhos de segurança no Worker

**Files:**
- Modify: `src/server.ts` (embrulhar a resposta do handler)
- Create: `src/lib/security-headers.ts`, `src/lib/security-headers.test.ts`

**Interfaces:**
- Produces: `securityHeaders(isProduction: boolean): Record<string, string>` com valores exatos:
  ```
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; font-connect? -> connect-src 'self' https://klwqeycfdfeulqrwngky.supabase.co wss://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  ```
  Em dev (`isProduction === false`) devolve **só** `X-Content-Type-Options` e `Referrer-Policy` (CSP estrita quebra o preamble do Vite). Toggle `CSP_REPORT_ONLY=1` troca a header por `Content-Security-Policy-Report-Only` para validação sem quebrar.

- [ ] **Step 1: Testes que falham** — produção contém `frame-ancestors 'none'` e `X-Frame-Options: DENY`; dev **não** contém CSP; report-only troca o nome da header; valores exatos batem com a Interfaces.
- [ ] **Step 2: Implementar** `securityHeaders()` e aplicar no handler de `src/server.ts` sem sobrescrever headers já definidos pela resposta.
- [ ] **Step 3: Conferir as origens reais** — `git grep -n "fonts.googleapis\|fonts.gstatic\|supabase.co" -- src index.html` e alinhar `style-src`/`font-src`/`connect-src` ao que o app carrega (a CSP tem que ser verdadeira, não bonita).
- [ ] **Step 4: Verificação** — `npx vitest run src/lib/security-headers.test.ts && npm run build`. Validação em produção fica pendente do deploy (T22 anota o `HEAD` para rodar depois).

---

## Task 18 — M2: rate limiting

**Files:**
- Create: `src/lib/rate-limit.ts`, `src/lib/rate-limit.test.ts`
- Modify: `src/lib/backups.functions.ts` (`generateBackupNow`), `src/lib/patients.functions.ts` (`bulkCreatePatients`), `src/routes/login.tsx` (backoff no cliente)

**Interfaces:**
- Produces: `checkRateLimit(key: string, limit: number, windowMs: number, now?: number): { ok: boolean; retryAfterMs: number }` — janela deslizante em `Map` com expiração (`setInterval`/lazy sweep), por chave `tipo:identidade` (`backup:<clinicId>`, `bulk:<userId>`, `login:<ip>`). `limitFor(key, limit, windowMs)` → lança `"Muitas tentativas. Tente novamente em Xs."` quando bloqueado.
  Limites: `generateBackupNow` → 1 / 30 min por clínica; `bulkCreatePatients` → 5 / h por usuário; login → 10 / 15 min por IP (cliente, com campo desabilitado enquanto trava).

- [ ] **Step 1: Testes que falham** — 3 chamadas ok, 4ª bloqueia (fake timers); janela expira e volta a permitir; chaves diferentes não interferem; `now` injetado (sem esperar tempo real).
- [ ] **Step 2: Implementar** `checkRateLimit`/`limitFor`.
- [ ] **Step 3: Aplicar** nas 3 frentes; no login, desabilitar o botão + mensagem de erro contendo o `retryAfterMs`.
- [ ] **Step 4: Verificação** — `npx vitest run src/lib/rate-limit.test.ts && npx tsc --noEmit && npm test && npm run build`.
  Nota: em Workers o estado é por isolado (melhor esforço) — documentar em `AGENTS.md`; a proteção dura fica no Cloudflare WAF, se o Diego quiser ativar depois.

---

## Task 19 — M3: sessão em cookie httpOnly (`@supabase/ssr`)

**Files:**
- Modify: `src/integrations/supabase/client.ts` (trocar `createClient` por `createBrowserClient`), `src/integrations/supabase/auth-attacher.ts`, `src/integrations/supabase/auth-middleware.ts` (ler cookie quando não houver `Authorization`)
- Create: `src/integrations/supabase/cookie.test.ts`

**Interfaces:**
- Produces: `readSessionFromCookie(cookieHeader: string | null, ref: string): { accessToken: string; refreshToken?: string } | null` — lê `sb-<ref>-auth-token` (valor pode estar prefixado com `base64-`), decodifica JSON, devolve `access_token`; `null` em ausência/corrupção (nunca lança).
  Ordem de autenticação no servidor: header `Authorization` (compatibilidade) **→** cookie.

- [ ] **Step 1: Testes que falham** — cookie válido → token; sem cookie → `null`; cookie truncado/corrompido → `null` sem exceção; prefixo `base64-` decodificado; compat: header `Authorization` continua funcionando.
- [ ] **Step 2: Implementar `readSessionFromCookie`** e usá-la como fallback em `auth-middleware.ts`.
- [ ] **Step 3: Trocar o cliente do navegador** para `createBrowserClient` (o pacote `@supabase/ssr` já está nas dependências) mantendo a mesma URL/chave.
- [ ] **Step 4: Verificação**
  - Run: `npx tsc --noEmit && npm run lint && npm test && npm run build` → verdes.
  - Passo manual registrado em `docs/testing-rls.md`: `npm run dev` → login → reload mantém sessão → server function autenticada responde → logout limpa cookie. **Este é o passo mais arriscado do plano**; commit próprio (Bloco G fecha aqui) para revert pontual.

---

## Task 20 — B9 + B11: uma lockfile, `.npmrc` e CI

**Files:**
- Create: `.github/workflows/ci.yml`, `.npmrc`
- Delete: `bun.lock`, `bunfig.toml`
- Modify: `README.md`, `README.en.md` (bun → npm), `.gitignore`

**Interfaces:**
- Produces: `.npmrc` com `minimum-release-age=1440` **somente se** `npm help config | Select-String minimum-release-age` confirmar o suporte (npm 11.17) — caso contrário, escrever no `.npmrc` um comentário explicando a ausência e compensar com `npm audit` obrigatório no CI.
  CI: `node 24`, passos `npm ci` → `npx tsc --noEmit` → `npm run lint` → `npm test` → `npm run build` → `npm audit --omit=dev --audit-level=high`; job separado `rls` com `supabase start` + `supabase db reset` + `npm run test:rls`.

- [ ] **Step 1: Confirmar suporte do npm** — Run: `npm help config | Select-String -Pattern "minimum-release-age"` (ou `npm config ls -l | Select-String minimum`). Registrar o resultado.
- [ ] **Step 2: Escrever `.npmrc`** conforme o resultado do Step 1.
- [ ] **Step 3: Apagar `bun.lock` e `bunfig.toml`** (`git rm`), já que npm é o gerenciador escolhido (bun nem está instalado).
- [ ] **Step 4: CI** — `.github/workflows/ci.yml` conforme a Interfaces; o job `rls` usa `supabase/cli-action` ou `npm i -g supabase` + `supabase start` (runner ubuntu já traz Docker).
- [ ] **Step 5: README** — trocar instruções `bun install`/`bun run` por `npm ci`/`npm run`; adicionar seção "Segurança" com `npm audit`, o `BACKUP_HOOK_SECRET` (T7) e como rodar a suíte de RLS.
- [ ] **Step 6: Verificação** — `npx tsc --noEmit && npm run lint && npm test && npm run build` e `git grep -n "bun " README.md README.en.md` sem ocorrências de instalação.

---

## Task 21 — B10: dependências vulneráveis

**Files:**
- Modify: `package.json`, `package-lock.json`
- Test: sem arquivo novo (verificação por comando)

- [ ] **Step 1: Aplicar correções sem breaking major** — Run: `npm audit fix` (**nunca** `--force`).
  Expected: sai de 20 para as que restarem; se alguma exigir major, pular e listar.
- [ ] **Step 2: Alvos nominais do relatório** — `vitest` (crítico, GHSA servidor UI lê/executa arquivo), `vite`, `postcss`, `nanoid`, `js-yaml`, `ws`, `undici` — subir minor/patch via `npm update <pkg>` se `npm audit fix` não cobrir.
- [ ] **Step 3: Verificação** — `npm audit` (registrar contagem final), `npx tsc --noEmit`, `npm test`, `npm run build`. Se um bump quebrar o build, reverter **só** aquele pacote e listar no relatório final.
- [ ] **Step 4: Commit do Bloco F/G/H** (T15–T21), um por bloco:
  ```
  security: server-side route guards and documentation truth (M1)
  security: neutralize CSV formula injection and lock invite redirects (M4, B6)
  security: security headers on worker responses (M9)
  security: best-effort rate limiting on backup, bulk import and login (M2)
  security: move supabase session from localStorage to httpOnly cookie (M3)
  chore: single npm lockfile, CI with audit and RLS suite (B9, B11)
  chore: patch vulnerable dependencies (B10)
  ```

---

## Task 22 — Verificação final, relatório e push

**Files:**
- Modify: nenhum código; `docs/superpowers/plans/` apenas marcar checkboxes

- [ ] **Step 1: Bateria completa**
  Run: `npx tsc --noEmit` · `npm run lint` · `npm test` · `npm run build` · `npm run test:rls` · `npm audit`
  Expected: tudo verde (RLS: Docker ativo, `supabase db reset` antes). Registrar a saída resumida.

- [ ] **Step 2: Revisão de segurança do próprio diff** — `git diff c498704 --stat` e percorrer os 35 achados do canvas marcando cada um como corrigido / parcial / não aplicável **com a evidência** (arquivo + teste). Nada de "deve estar certo".

- [ ] **Step 3: Pendências que só o Diego resolve** — lista final com:
  1. aplicar as 3 migrations no SQL editor do Lovable (produção);
  2. gerar e configurar `BACKUP_HOOK_SECRET` no agendador (e conferir se existe agendador apontando para o hook);
  3. deploy do Worker para os headers valerem + `HEAD https://patronus-flow.lovable.app/` para conferir CSP;
  4. demais pendências antigas: revogar `CLOUDFLARE_API_TOKEN`, e a resposta dele sobre o portfólio ficar só com `clinica-os`.

- [ ] **Step 4: Push (só após confirmação explícita)**
  Run: `git push origin main`
  Expected: aceito; depois disso, registrar o resultado na memória.

---

## Blocos de commit (11)

| # | Tarefas | Mensagem |
|---|---|---|
| A | T1–T4 | `security: add RLS integration harness and fix cross-tenant writes (C1, C2, M14)` |
| B | T5–T6 | `security: revoke anon DML, pin tenant predicates and role scopes in RLS (A6-A8, M8, M11-M13, B1-B6)` |
| C | T7–T10 | `security: dedicated webhook secret, active-clinic gate, audit redaction, drop open logAudit (A1-A4)` |
| D | T11–T13 | `security: schema-validate backup restore, stream decrypted download, bind backup AEAD to clinic (M5, M6, B7, B8)` |
| E | T14 | `feat(lgpd): real erasure/export flows and clinic data cleanup (A5, M7)` |
| F | T15–T16 | `security: server-side route guards and documentation truth (M1)` + `security: neutralize CSV formula injection and lock invite redirects (M4, B6)` |
| G | T17–T19 | `security: security headers on worker responses (M9)` + `security: rate limiting (M2)` + `security: httpOnly cookie session (M3)` |
| H | T20–T21 | `chore: single npm lockfile, CI with audit and RLS suite (B9, B11)` + `chore: patch vulnerable dependencies (B10)` |
