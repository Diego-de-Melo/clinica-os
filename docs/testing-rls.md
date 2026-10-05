# Testes de RLS (integração)

A suíte `tests/rls/` prova o isolamento entre clínicas em **Postgres de verdade**:
nada de mock de RLS. Ela roda fora do `npm test` de propósito — quem clona o
repositório sem Docker precisa continuar verde em `npm test`.

## Pré-requisitos

1. Docker Desktop rodando (`docker info` responde).
2. Supabase CLI instalada (`supabase --version`).
3. Stack local do projeto de pé.

## Como rodar

```bash
supabase start        # sobe Postgres + Auth + Storage locais (uma vez)
supabase db reset     # recria o schema aplicando supabase/migrations
npm run test:rls      # vitest com vitest.config.rls.ts
```

Em CI o mesmo roda no runner ubuntu (`docker` já existe lá); ver
`.github/workflows/ci.yml`, job `rls`.

As credenciais vêm do `supabase status --output json`. Se preferir, exporte:

```bash
SUPABASE_TEST_URL=http://127.0.0.1:54321
SUPABASE_TEST_ANON_KEY=...
SUPABASE_TEST_SERVICE_KEY=...
npm run test:rls
```

## O que a suíte garante

| Arquivo | Garantia |
| --- | --- |
| `baseline.test.ts` | O harness mede de verdade: `anon` lê 0 linhas em todas as tabelas, a clínica B não vê dados da A, e a A **vê** os seus (se este caso falhar, o problema é o harness, não a RLS). |
| `soft-delete.test.ts` | C1: `soft_delete_attendance` só apaga atendimento da própria clínica, com papel assistencial e clínica ativa. |
| `tenant-writes.test.ts` | M14: update/delete por id conferem `clinic_id`; não devolvem `ok:true` para registro alheio. |
| `privileges.test.ts` | A7/A8/B1/B2: `anon` sem DML, signup não escolhe `role`/`clinic_id`, membro nasce no tenant certo. |
| `policies.test.ts` | A6/M8/M11/M12/M13/B4/B6: papéis, consentimentos, FK por tenant, `log_audit` com `action` válida. |

## Convenções

- Cada arquivo chama `resetStack()` no `beforeAll` — estado determinístico,
  arquivos rodam em sequência (`fileParallelism: false`).
- Nomes de tenant/paciente são únicos por execução; não dependa de valores fixos.
- Um teste que precisa de Docker e não tem ele falha com mensagem instruindo a
  `supabase start` — nunca é ignorado silenciosamente.

## Limitação conhecida

O estado em memória do rate limiter (M2) é por isolado do Worker; isso **não**
é coberto aqui — é melhor esforço em runtime, a proteção dura é do WAF.
