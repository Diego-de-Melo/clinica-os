# Plano — Hardening de Segurança + Detalhe do Paciente

Escopo confirmado: **Segurança + Página do paciente**, mantendo os 4 perfis atuais (`super_admin`, `admin`, `contador`, `usuario`), incluindo **LGPD** e **Monitoramento/alertas**. **Sem mexer em layout, textos, rotas existentes ou fluxo de negócio.** Só adiciono o que não existe.

## O que já existe (não vou refazer)
- `clinic_id` + RLS por clínica em `patients`, `attendances`, `profiles`, `clinics`
- Bloqueio por clínica inativa/expirada (`is_clinic_active`)
- Convite por e-mail via `inviteUserByEmail` + `/aceitar-convite` + Google
- Página `/pacientes/:id` com dados + histórico de atendimentos
- `patient-combobox` com busca, CPF do responsável no dashboard, filtros dia/mês/ano, ordenação recente, anti-duplicado por nome/CPF
- Índices `clinic_id` e `patient_id` em attendances/patients

## Parte 1 — Banco de dados (1 migration)

### 1.1 Soft delete
- Adicionar `deleted_at timestamptz NULL` em `patients` e `attendances`
- Atualizar policies `SELECT` para filtrar `deleted_at IS NULL`
- Trocar `deletePatient`/`deleteAttendance` por `UPDATE deleted_at = now()` em vez de `DELETE`

### 1.2 Auditoria
Criar `public.audit_logs`:
```
id uuid PK, user_id uuid, clinic_id uuid, action text,
entity text, record_id uuid, metadata jsonb,
ip text, user_agent text, created_at timestamptz default now()
```
- GRANT `INSERT` para `authenticated`, `ALL` para `service_role`, `SELECT` só para `admin` da própria clínica e `super_admin`
- Índices: `(clinic_id, created_at desc)`, `(entity, record_id)`
- Função `public.log_audit(action, entity, record_id, metadata)` SECURITY DEFINER que lê `auth.uid()` + `current_clinic_id()`

### 1.3 LGPD
Criar `public.consents`: `id, user_id, clinic_id, kind, granted_at, revoked_at, ip, user_agent`
- RLS: usuário lê o próprio; admin da clínica lê todos da sua clínica

### 1.4 Índices que faltam
- `idx_attendances_status (clinic_id, status)`
- `idx_attendances_created (clinic_id, created_at desc)`
- `idx_attendances_date (clinic_id, date desc)`
- `idx_audit_logs_clinic_created (clinic_id, created_at desc)`

### 1.5 Agregado do dashboard (RPC)
Criar `public.dashboard_summary()` SECURITY DEFINER retornando JSON com totais (total pacientes, total atendimentos, receita do período, contagem por status) — substitui as múltiplas queries do dashboard por **uma chamada**.

## Parte 2 — Server functions

### 2.1 `src/lib/audit.functions.ts` (novo)
- `logAudit({ action, entity, recordId, metadata })` — chama RPC `log_audit`
- Chamado em: `createPatient`, `updatePatient`, `deletePatient` (soft), `createAttendance`, `updateAttendanceStatus`, `deleteAttendance` (soft), `createClinicWithAdmin`, login bem-sucedido (no `getSessionContext` quando primeira chamada da sessão)
- IP/UA lidos via `getRequest().headers`

### 2.2 Soft delete
- `patients.functions.ts` / `attendances.functions.ts`: trocar `.delete()` por `.update({ deleted_at: new Date() })`
- `list*` já filtra via RLS

### 2.3 Dashboard agregado
- `getDashboardSummary` server fn chamando RPC `dashboard_summary`
- Dashboard troca múltiplos `useQuery` por **um** `useSuspenseQuery` com `staleTime: 30_000`, refetch a cada 60s

### 2.4 LGPD
`src/lib/lgpd.functions.ts`:
- `exportPatientData({ patientId })` → JSON com paciente + atendimentos + consentimentos (admin da clínica)
- `anonymizePatient({ patientId })` → substitui nome/CPF/responsáveis por hash, mantém atendimentos para contabilidade (admin)
- `recordConsent({ kind })` → insert em `consents`

## Parte 3 — Segurança de login
Via `supabase--configure_auth`:
- `password_min_length: 8`, `password_required_characters` forte
- `password_hibp_enabled: true` (leaked password check)
- `email_confirm: true` (validação de e-mail no signup; convite continua funcionando)
- Rate limit de tentativas (config padrão Supabase já aplica; documentar)
- **Recuperação de senha**: adicionar link "Esqueci minha senha" em `/login` → `supabase.auth.resetPasswordForEmail` → reutiliza `/aceitar-convite` para definir nova senha
- **2FA**: deixar estrutura pronta documentada (não habilitar TOTP agora — só preparar)

## Parte 4 — Monitoramento
- `src/lib/error-capture.ts` já existe — estender para enviar erros server-side para `audit_logs` com `action='error'`
- Server fn `logClientError({ message, stack, url })` chamada do `__root.tsx` em `window.onerror` / `unhandledrejection`
- View admin: nova seção em `/master-admin` listando últimos `audit_logs` com `action='error'` (super_admin only)

## Parte 5 — Página do paciente (ajustes mínimos)
A página `/pacientes/:id` já existe. Adições:
- Botão **"Novo Atendimento"** no card de histórico → abre modal (Data, Valor, Forma de pagamento, Status, Observações) → chama `createAttendance` → invalida query, sem reload
- Botão **"Editar"** no card de dados cadastrais → modal com `updatePatient`
- Coluna **Ações** na tabela: Visualizar, Editar, Excluir (com `AlertDialog` de confirmação, soft delete)
- Badges de status já existem; manter cores atuais (verde/amarelo/vermelho)
- Campo `observacoes` em `attendances` — **NÃO existe na tabela hoje**. Adicionar `observacoes text NULL` na migration da Parte 1

## Parte 6 — Cache (React Query)
Já configurado. Padronizar nas queries novas:
- `staleTime: 30_000`
- `refetchInterval: 60_000` para dashboard e listas
- `invalidateQueries` após cada mutação

## Arquivos
**Migration nova:**
- `supabase/migrations/<ts>_hardening.sql` (soft delete, audit_logs, consents, índices, RPC dashboard, observacoes)

**Server fns novos:**
- `src/lib/audit.functions.ts`
- `src/lib/lgpd.functions.ts`
- `src/lib/dashboard.functions.ts`

**Server fns editados:**
- `src/lib/patients.functions.ts` (soft delete + audit + filtro deleted_at)
- `src/lib/attendances.functions.ts` (soft delete + audit + observacoes)
- `src/lib/clinics.functions.ts` (audit)
- `src/lib/session.functions.ts` (audit login)

**UI:**
- `src/routes/_app/pacientes.$id.tsx` (modal novo atendimento, editar dados, ações com confirmação)
- `src/routes/_app/dashboard.tsx` (trocar para `getDashboardSummary`)
- `src/routes/login.tsx` (link "Esqueci minha senha")
- `src/routes/master-admin.tsx` (visualização de audit_logs de erro)
- Novos componentes: `src/components/new-attendance-dialog.tsx`, `src/components/edit-patient-dialog.tsx`, `src/components/confirm-delete-dialog.tsx`

## Não escopo (fora deste plano)
- 2FA TOTP ativo (só preparação)
- Renomear `contador`/`usuario` para `FUNCIONARIO`
- Backups automáticos (já são responsabilidade da Lovable Cloud — retenção 7-30 dias dependendo do plano)
- Migrar pacientes existentes para anonimização

## Ordem de execução
1. Migration (Parte 1)
2. Configuração de auth (Parte 3 — `configure_auth`)
3. Server fns de audit + soft delete + dashboard agregado + LGPD
4. UI: modais da página de paciente, recuperação de senha, visualização de logs
5. Testes manuais: criar/editar/excluir paciente e atendimento conferindo audit_logs e RLS cruzada entre clínicas

Após aprovação, executo tudo nessa ordem.