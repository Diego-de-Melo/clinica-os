
## 1. Pacientes — campos pai/mãe e edição direta

**Banco** (migration):
- Adicionar em `public.patients`: `father_name text`, `father_cpf text`, `mother_name text`, `mother_cpf text`.
- Manter `responsible_name`/`responsible_cpf` por compatibilidade (não usados na UI nova).

**Server fns** (`src/lib/patients.functions.ts`):
- Estender `patientInput` com os 4 novos campos.
- `updatePatient` já existe — usar.

**UI** (`src/routes/_app/pacientes.tsx`):
- Remover botão "Ver detalhes".
- Tornar o nome do paciente clicável (admin) abrindo `EditPatientDialog` em vez de navegar para `/pacientes/$id`. Para contador/usuário, segue como Link para detalhes (somente leitura).
- `EditPatientDialog`: formulário com Nome, CPF, Pai (nome + CPF), Mãe (nome + CPF). Botão "Salvar" chama `updatePatient`.
- `NewPatientDialog`: trocar campos de "responsável" por blocos Pai/Mãe.
- Botão Remover continua inline (admin).

**Detalhe** (`src/routes/_app/pacientes.$id.tsx`):
- Substituir campos "Responsável/CPF do responsável" por Pai, CPF do pai, Mãe, CPF da mãe.

## 2. Equipe — alterar papel (admin)

**Server fn** (`src/lib/team.functions.ts`):
- Novo `updateTeamMemberRole({ id, role })` protegido por `requireClinicAdmin`. Atualiza `profiles.role` via `supabaseAdmin` validando que o alvo pertence à mesma `clinic_id` e que não é o próprio admin (evita auto-rebaixamento).

**UI** (`src/routes/_app/equipe.tsx`):
- Coluna "Papel": trocar `Badge` por `<Select>` inline com opções Admin/Contador/Usuário (somente para outros membros; próprio admin permanece Badge).
- `onValueChange` chama `updateTeamMemberRoleFn` + invalida `["team"]`.

## 3. Novo atendimento — método de pagamento como Select + destinatário da nota

**Banco** (mesma migration acima):
- `attendances.invoice_for text not null default 'patient'` com CHECK em ('patient','father','mother').

**Constantes** (`src/lib/attendances.functions.ts`):
- Exportar `PAYMENT_METHODS = ['Pix','Dinheiro','Cartão de Crédito','Cartão de Débito','Boleto','Transferência']`.
- Exportar `INVOICE_FOR = ['patient','father','mother']` com labels.
- Estender `attInput` com `invoice_for` (default 'patient'); `payment_method` continua opcional mas validado contra a lista.

**UI `NewAttendanceDialog`** (`src/routes/_app/dashboard.tsx`):
- Trocar `Input` de pagamento por `<Select>` com `PAYMENT_METHODS`.
- Novo `<Select>` "Emitir nota para": Paciente / Pai / Mãe — opções desabilitadas quando o paciente selecionado não tiver o respectivo nome cadastrado (lookup local na lista de pacientes).

## 4. Dashboard — mostrar destinatário e tornar clicável

**UI** (`src/routes/_app/dashboard.tsx`):
- Nova coluna "Emitir para" exibindo o nome efetivo (paciente / pai / mãe) + sub-label do papel.
- Tornar essa célula um `Link` para `/pacientes/$id` (com query `?focus=<attendanceId>` opcional para realce).
- A página de detalhe do paciente já lista todo o histórico de atendimentos — adicionar coluna "Emitir para" lá também.

## 5. Fluxo de status — Contador vs Admin

Regra explícita por papel, substituindo a lógica atual `statusOptions.filter(s !== status)`:

```text
Contador (apenas, demais opções escondidas):
  Pendente      → [Emitir, CPF Inválido]
  CPF Inválido  → (nenhuma ação — aguardando admin)
  Emitido       → [Reabrir (=Pendente), CPF Inválido]

Admin:
  Pendente      → (nenhuma ação de status — aguarda contador)
  CPF Inválido  → [Corrigir]  (Corrigir = set status='Pendente')
  Emitido       → (nenhuma ação de status)
  + Remover atendimento (já existe)

Usuário: somente leitura.
```

Implementação: nova função `allowedTransitions(role, status): AttendanceStatus[]` em `attendances.functions.ts` (também usada no server para validar — `updateAttendanceStatus` checa transição permitida por papel além do `assertStaffRole`). Rotular "Reabrir" e "Corrigir" mapeando para `Pendente`.

Botão "Novo atendimento" continua só para admin (já está assim).

## Arquivos afetados

- `supabase/migrations/<novo>.sql` — adiciona colunas em `patients` e `attendances`.
- `src/lib/patients.functions.ts` — schema com pai/mãe.
- `src/lib/attendances.functions.ts` — `invoice_for`, `PAYMENT_METHODS`, `allowedTransitions`, validação no `updateAttendanceStatus`.
- `src/lib/team.functions.ts` — `updateTeamMemberRole`.
- `src/routes/_app/pacientes.tsx` — remover "Ver detalhes", nome clicável → editar (admin), novo dialog, campos pai/mãe.
- `src/routes/_app/pacientes.$id.tsx` — exibir pai/mãe e coluna "Emitir para".
- `src/routes/_app/equipe.tsx` — Select inline de papel.
- `src/routes/_app/dashboard.tsx` — Select de pagamento, Select destinatário, coluna clicável, transições por papel.

Sem mudanças em RLS (continua `staff` para update; validação fina por papel é server-side dentro do handler).
