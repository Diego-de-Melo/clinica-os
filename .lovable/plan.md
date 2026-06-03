
# Logs Super Admin + Backups Automáticos Criptografados

## 1. Tela de Logs no Super Admin

Nova rota `/master-admin/logs` (filha de `master-admin`), acessível apenas para `super_admin`.

Funcionalidades:
- Lista todos os `audit_logs` de todas as clínicas (a policy atual já permite super_admin)
- Filtros: clínica, usuário (email), ação, entidade, intervalo de datas
- Paginação (50 por página), ordenado por mais recente
- Colunas: data/hora, clínica, usuário, ação, entidade, IP, user-agent, metadata (expansível)
- Botão "Exportar CSV" (gera o arquivo no cliente a partir do resultado atual)
- Link no header do `master-admin` para acessar a tela

Backend:
- Estender `listAuditLogs` (`src/lib/audit.functions.ts`) para super_admin: aceitar filtros, fazer join com `profiles` e `clinics` para retornar email/nome da clínica. Mantém comportamento atual para admin de clínica (só vê a própria).

## 2. Backups Automáticos Criptografados

### Modelo de dados (migração)
- Tabela `backup_configs` (1 por clínica): `clinic_id` (PK), `enabled` (default true), `retention_days` (30/90/365, default 90), `schedule` (default `daily_03`), `last_run_at`, `last_status`, `last_error`
- Tabela `backups`: `id`, `clinic_id`, `version` (sequencial por clínica), `created_at`, `size_bytes`, `record_counts` (jsonb com counts de patients/attendances), `object_path`, `iv` (bytea), `auth_tag` (bytea), `checksum_sha256`, `status` (`success|failed|restoring`), `expires_at`, `created_by` (`system|user_uuid`)
- RLS: admin lê/baixa apenas backups da sua clínica; super_admin vê todos; insert apenas via service_role (cron + server fn admin)
- GRANTs apropriados em ambas

### Storage
- Bucket privado `clinic-backups` (criação via tool dedicada). Sem políticas de leitura pública; todo acesso via service_role + URL assinada.

### Criptografia
- Algoritmo: **AES-256-GCM**, IV de 12 bytes aleatório por backup, auth_tag armazenado na tabela
- Chave única do servidor: secret `BACKUP_ENCRYPTION_KEY` (32 bytes base64), criada via `secrets--add_secret`
- O conteúdo plano é `{ clinic, patients[], attendances[], consents[], exported_at, version }` em JSON
- Helper `src/lib/backup-crypto.server.ts` com `encrypt(plaintext)` / `decrypt(cipher, iv, tag)` usando `node:crypto`

### Job diário (03:00 BRT)
- Rota pública `src/routes/api/public/hooks/run-clinic-backups.ts` (POST)
  - Valida header `apikey` contra `SUPABASE_PUBLISHABLE_KEY`
  - Itera clínicas ativas com `backup_configs.enabled = true`
  - Para cada uma: lê `patients` + `attendances` + `consents` via `supabaseAdmin`, serializa, criptografa, faz upload em `clinic-backups/{clinic_id}/{yyyy-mm-dd}-v{N}.bin`, insere registro em `backups`, atualiza `last_run_at`
  - Aplica retenção: deleta (storage + linha) backups com `created_at < now() - retention_days`
  - Loga `backup.run` em `audit_logs` por clínica
- Agendamento via `pg_cron + pg_net` chamando a rota às 06:00 UTC (= 03:00 BRT)

### Server functions (admin da clínica)
- `listBackups()` → lista backups da clínica (sem download_url)
- `generateBackupNow()` → executa o mesmo pipeline imediatamente, marca `created_by = user_id`, loga `backup.manual_create`
- `getBackupDownloadUrl({ id })` → valida admin + clínica, **descriptografa em memória**, faz re-upload temporário num path único `tmp/{uuid}.json` no bucket, retorna URL assinada de **15 min**, loga `backup.download` com metadata `{ backup_id, ip }`. Agenda exclusão do tmp após 20 min via job de limpeza.
  - Alternativa mais simples: retornar o conteúdo descriptografado direto pelo serverFn como `Blob` (mas exigiria streaming). Optar pelo padrão URL assinada para arquivos grandes.
- `getBackupConfig()` / `updateBackupConfig({ enabled, retention_days })`
- `restoreBackup({ id, confirmation })` → exige `confirmation === "RESTAURAR"`; descriptografa; faz upsert idempotente em transação (não apaga dados criados após o snapshot, apenas reinsere/atualiza por id); loga `backup.restore` com diff de contagens

### UI (admin clínica)
- Nova rota `/_app/backups`: link no menu principal
- Card de configuração: switch "Backup automático", select retenção (30/90/365 dias), última execução, próximo agendamento
- Botão "Gerar backup agora" (com spinner)
- Tabela de backups: data, versão, tamanho, registros (pacientes/atendimentos), ações [Baixar] [Restaurar]
- Modal de restauração: aviso vermelho + campo de confirmação digitando `RESTAURAR`

### Auditoria
Eventos registrados: `backup.run` (system, por clínica), `backup.manual_create`, `backup.download`, `backup.restore`, `backup.config_update`, `backup.retention_purge`

## 3. Segurança — checklist
- Chave AES nunca exposta ao cliente (apenas `process.env` no server)
- Bucket privado, sem policy pública
- URLs assinadas de 15 min, geradas server-side após verificação de papel + clínica
- Restauração exige confirmação textual e log de auditoria
- Cron usa `apikey` (anon key) — endpoint em `/api/public/*` apenas para receber o trigger; toda lógica usa `supabaseAdmin`
- Tabelas com RLS estrita por `clinic_id` + role

## 4. Ordem de execução
1. Migração: tabelas `backup_configs`, `backups`, RLS, GRANTs, índices
2. Criar secret `BACKUP_ENCRYPTION_KEY` (32 bytes base64)
3. Criar bucket privado `clinic-backups`
4. Helpers de cripto + server functions
5. Rota cron + agendamento pg_cron
6. UI `/master-admin/logs`
7. UI `/_app/backups` + link no menu
8. Estender `listAuditLogs` com filtros para super_admin
