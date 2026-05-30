## Mudanças no Dashboard e Pacientes

### 1. Busca de paciente tipo "autocomplete" no Novo Atendimento
Substituir o `<Select>` de paciente por um Combobox (Command + Popover do shadcn) onde o admin digita e a lista filtra em tempo real pelo nome (case-insensitive, sem acento opcional). Mantém o mesmo `patientId` no estado.

### 2. CPF do paciente + CPF do responsável no Dashboard
- Coluna **Paciente**: nome + linha menor com o CPF (ou "—" se vazio).
- Coluna **Emitir para**: quando `invoice_for` for `father`/`mother`, mostrar nome + CPF do responsável correspondente (`father_cpf` / `mother_cpf`); quando for `patient`, mostrar CPF do paciente.
- A mesma coluna na tela de detalhes do paciente recebe o mesmo tratamento.
- Vale para admin e contador (a tabela é a mesma).

### 3. Filtros por dia / mês / ano
Adicionar acima da tabela 3 selects:
- **Ano** (opções: anos distintos presentes nos atendimentos + ano atual)
- **Mês** (1–12, desabilitado se Ano = "Todos")
- **Dia** (1–31, desabilitado se Mês = "Todos")
- Botão "Limpar filtros".

Filtragem é client-side sobre os dados já carregados (mesma query). Os cards de totais (Total faturado, Pendentes, CPF Inválido, Emitidos) passam a refletir o conjunto filtrado.

### 4. Ordenação no Dashboard
Garantir ordem por `created_at desc` (mais recente primeiro). Hoje `listAttendances` ordena por `date desc`. Vou trocar para `created_at desc` em `src/lib/attendances.functions.ts`.

### 5. Impedir cadastro de paciente duplicado
- Migração: índice único parcial em `patients (clinic_id, lower(name))` e em `(clinic_id, cpf)` quando `cpf` não for nulo/vazio.
- Em `createPatient` e `bulkCreatePatients`: tratar erro `23505` e devolver mensagem amigável ("Paciente já cadastrado: nome" / "CPF já cadastrado").
- `EditPatientDialog`/`NewPatientDialog`: mostrar o toast com a mensagem retornada.

### Critério de "duplicado"
Mesmo nome (case-insensitive, trim) na mesma clínica **ou** mesmo CPF na mesma clínica.

### Arquivos afetados
- `supabase/migrations/<nova>.sql` — índices únicos.
- `src/lib/patients.functions.ts` — tratamento de erro de duplicidade.
- `src/lib/attendances.functions.ts` — `order('created_at', desc)`.
- `src/routes/_app/dashboard.tsx` — Combobox de paciente, coluna com CPFs, filtros dia/mês/ano, totais filtrados.
- `src/routes/_app/pacientes.$id.tsx` — coluna "Emitir para" com CPF.
- Novo componente: `src/components/patient-combobox.tsx` (Command + Popover).

Sem mudanças em RLS nem no fluxo de status.
