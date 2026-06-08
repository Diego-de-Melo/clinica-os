## Objetivo

Hoje os papéis são limitados: só **Admin** mexe em pacientes/atendimentos, **Contador** só muda status, **Usuário** só visualiza. Você quis dar a uma pessoa acesso para "criar, editar, excluir e visualizar pacientes e atendimentos" — e isso hoje só existe como Admin (que também gerencia equipe, backups, etc.).

Duas entregas, na mesma rodada:

1. **Criar um papel novo "Operador"** com exatamente esse escopo (CRUD completo em pacientes e atendimentos, sem mexer em equipe nem backups). Admin continua sendo o "dono" da clínica.
2. **Melhorar a tela Equipe** deixando claro que você pode ter **vários Admins** (caso queira dar acesso total mesmo).

## O que muda na prática (visão do usuário)

Na tela **Equipe → Adicionar membro**, as opções de papel passam a ser:

- **Admin** — controle total da clínica (pacientes, atendimentos, equipe, backups). Pode ter mais de um.
- **Operador** *(novo)* — cria, edita, exclui e visualiza pacientes e atendimentos. Não gerencia equipe nem backups.
- **Contador** — altera só o status dos atendimentos (Pendente/Emitido/CPF inválido).
- **Usuário** — só visualiza.

Cada opção ganha uma descrição curta embaixo para você escolher sem dúvida.

## Detalhes técnicos

### Banco (migration)

- `ALTER TYPE public.app_role ADD VALUE 'operador'`.
- Atualizar as RLS policies de `patients` e `attendances` para permitir INSERT/UPDATE/DELETE quando `current_role() IN ('admin','operador')` (hoje é só `'admin'`). SELECT já cobre toda a clínica.
- Trigger `prevent_profile_privilege_escalation` continua bloqueando auto-promoção; só Admin/Super Admin promove via tela Equipe.
- Sem mudança em `backup_configs`, `backups`, `audit_logs`, `profiles` (Operador não tem acesso a essas áreas).

### Guards de servidor

- `src/lib/auth-guards.ts`: adicionar tipo `"operador"` em `AppRole` e novo helper `assertPatientWriter(role)` / `assertAttendanceWriter(role)` que aceitam `admin` e `operador`.
- `src/lib/patients.functions.ts`: trocar `assertAdminRole` por `assertPatientWriter` em `createPatient`, `updatePatient`, `deletePatient`, `bulkCreatePatients`.
- `src/lib/attendances.functions.ts`: trocar `assertAdminRole` por `assertAttendanceWriter` em `createAttendance`, `updateAttendance`, `deleteAttendance`. `updateAttendanceStatus` continua com `assertStaffRole` (Admin/Contador) — Operador também passa a ser válido lá, então estender o helper.
- Equipe/Backups continuam exigindo `admin`/`super_admin` (sem mudança).
- Mensagens de erro atualizadas para "Apenas Admin ou Operador podem…".

### UI

- `src/routes/_app/equipe.tsx`: adicionar `"operador"` no enum local `Role`, no rótulo (`operador: "Operador"`), nos dois `<Select>` (linha da tabela e modal de adicionar) com a descrição "Operador — cria/edita pacientes e atendimentos".
- `src/routes/_app.tsx`: rótulo do papel no sidebar (`ROLE_LABELS.operador = "Operador"`).
- Pequeno texto informativo no topo da página Equipe: *"Você pode ter mais de um Admin. Use Operador quando quiser dar acesso a pacientes e atendimentos sem permitir gerenciar a equipe."*

### Testes

- Atualizar `src/lib/rls-policies.test.ts`: `PATIENT_WRITE_ROLES = ["admin","operador"]`, `ATTENDANCE_WRITE_ROLES = ["admin","contador","operador"]`, `ATTENDANCE_DELETE_ROLES = ["admin","operador"]`.

## Fora de escopo

- Não mexer em backups, logs, super-admin, telas existentes além de Equipe e rótulos de papel.
- Não criar permissões granulares por entidade — só o papel novo "Operador".
