## Mudanças solicitadas

### 1. Contador — restrições
- Esconder o botão "Novo atendimento" no `/dashboard` para `contador` (só `admin` cria atendimentos).
- Backend `createAttendance`: trocar `assertStaffRole` por `assertAdminRole` (somente admin insere).
- No dropdown de status do Dashboard, quando o usuário for `contador`, mostrar apenas `Pendente`, `CPF Inválido`, `Emitido` (ocultar `Corrigido`). Admin continua vendo todos.

### 2. Ações em linha (Inline / Direct Toggle)
Substituir os menus `DropdownMenu` por botões/toggles diretos visíveis na linha:

**`/master-admin` — tabela de clínicas:** trocar o "⋯" por uma barra de ações inline:
- Switch (Direct Toggle) para Ativo/Inativo
- Botão "Renovar +30"
- Botão "Vencimento" (abre dialog de data)
- Botão "Editar" (novo — item 4)
- Botão "Remover" (ícone lixeira, com confirm)

**`/pacientes`:** já é inline — manter, só adicionar botão "Editar" se aplicável (não solicitado para admin neste item).

**`/equipe`:** se houver dropdown de papel/remoção, transformar em select inline + botão remover (verificar arquivo no momento da implementação).

### 3. Dashboard — ação e status
- Manter coluna Status já existente.
- Adicionar nova coluna **Ações** ao final da tabela `/dashboard`:
  - Admin: ícone lixeira (remove atendimento via `deleteAttendance` já existente).
  - Contador: sem ações (somente troca de status via select inline já presente).

### 4. Editar clínica no Master Admin
- Adicionar botão "Editar" inline (ícone lápis) que abre `EditClinicDialog`.
- Dialog edita `name`, `status`, `expiration_date` em um único form e chama `updateClinic` (já aceita `name`, `status`, `expirationDate`).
- (Admin não recebe botão de editar, conforme escolha.)

### 5. Bug do "Renovar +30 dias"
Corrigir cálculo em `master-admin.tsx`:

```text
base = max(hoje, expiration_date atual)
nova = base + 30 dias
```

Substitui o atual `new Date()` + 30 (que ignora a data vigente) pela soma a partir do maior entre hoje e o vencimento atual, preservando renovações antecipadas.

## Arquivos afetados

- `src/lib/attendances.functions.ts` — `createAttendance` passa a exigir `admin`.
- `src/routes/_app/dashboard.tsx` — esconder botão "Novo atendimento" para contador; filtrar statuses do select por papel; nova coluna Ações com remover (admin).
- `src/routes/master-admin.tsx` — substituir DropdownMenu por ações inline (Switch ativo/inativo, Renovar, Vencimento, Editar, Remover); novo `EditClinicDialog`; corrigir cálculo de "Renovar +30".
- `src/routes/_app/equipe.tsx` — revisar e converter ações para inline (se houver dropdown).

Sem alterações no banco/RLS (a regra de contador não inserir já cai como erro do server function; RLS atual permite contador inserir mas o guard do servidor bloqueia antes).
