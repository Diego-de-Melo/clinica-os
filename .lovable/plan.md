# Página de Detalhes do Paciente — ajustes

A página `/pacientes/$id` já existe com cards de Dados Cadastrais e Histórico de Atendimentos, modais de novo/editar/visualizar/excluir, badges coloridas, soft delete e cache (staleTime 30s + refetch 60s + invalidate após mutação). Apenas dois ajustes são necessários para alinhar ao spec.

## 1. Navegação a partir da lista (`src/routes/_app/pacientes.tsx`)

Hoje, na tabela de Pacientes:
- Não-admin: já navega para `/pacientes/$id` via `<Link>`.
- Admin: clica no nome e abre modal `EditPatientDialog`.

Trocar para que **todos os perfis** naveguem para `/pacientes/$id` ao clicar no nome. A edição continua disponível dentro da página de detalhes (botão "Editar" do Card 1, já implementado).

Mudanças:
- Substituir o `<button>` condicional do nome por `<Link to="/pacientes/$id" params={{ id: p.id }}>` para todos.
- Remover o state `editing`, o componente local `EditPatientDialog` desta rota e o bloco `{editing && …}`.
- Manter `ImportCsvDialog`, `NewPatientDialog` e o botão "Remover" da `ActionCell` intactos.

Card 1 fica com os campos atuais (Nome, CPF, Pai, CPF do pai, Mãe, CPF da mãe, Cadastro), conforme decidido.

## 2. Status "Cancelado" no atendimento

Adicionar `Cancelado` como status válido, mantendo os existentes (`Pendente`, `CPF Inválido`, `Corrigido`, `Emitido`).

### Migration
```sql
-- Atualiza CHECK constraint de attendances.status (se existir) e
-- permite "Cancelado". Não há enum: status é text com CHECK.
ALTER TABLE public.attendances DROP CONSTRAINT IF EXISTS attendances_status_check;
ALTER TABLE public.attendances ADD CONSTRAINT attendances_status_check
  CHECK (status IN ('Pendente','CPF Inválido','Corrigido','Emitido','Cancelado'));
```
(Verificar antes via `read_query` se a constraint existe com esse nome; ajustar nome se diferente.)

### Código
- `src/lib/attendances.functions.ts`: adicionar `"Cancelado"` em `ATTENDANCE_STATUSES`. Não alterar `allowedTransitions` (apenas admin define no formulário de criar/editar; transições por botão não mudam).
- `src/routes/_app/pacientes.$id.tsx`: na `StatusBadge`, adicionar caso `Cancelado` → `<Badge variant="destructive">Cancelado</Badge>`.

## Fora de escopo (decidido pelo usuário)
- Não criar colunas novas em `patients` (telefone, email, endereço, etc.).
- Não alterar layout global, textos atuais nem fluxo de outras telas.
- Modais, soft delete, cache e responsividade já implementados — sem mexer.

## Ordem
1. Migration do CHECK de status.
2. Editar `attendances.functions.ts` (adicionar `Cancelado`).
3. Editar `pacientes.tsx` (Link para todos) e `pacientes.$id.tsx` (badge Cancelado).