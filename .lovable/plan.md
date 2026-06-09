## Causa do erro

Ao tentar **trocar o papel de um membro** (inclusive para "Operador"), o servidor chama `supabaseAdmin.from("profiles").update({ role })`. Existe um gatilho no banco — `prevent_profile_privilege_escalation` — que bloqueia qualquer mudança de `role`, `clinic_id`, `email` etc. a menos que quem está rodando seja Super Admin.

O cliente admin do servidor (service_role) não tem `auth.uid()`, então `is_super_admin()` devolve `false` e o gatilho dispara: **"Not allowed to change role"**. A tela mostra só "Erro" porque o `catch` da UI engole a mensagem real.

Isso afeta **toda** mudança de papel (operador, contador, usuário, admin) — não é específico de Operador. A criação de membro novo funciona no INSERT, mas o usuário também relata erro nessa tela; provavelmente é o mesmo caminho (tentar editar depois de criar) — fica coberto pela mesma correção.

## Correção

### 1. Migration — relaxar o gatilho para o service_role

Atualizar `public.prevent_profile_privilege_escalation()` para permitir alterações quando a requisição vier com JWT `role = 'service_role'` (mesmo padrão já usado em `handle_new_user`). Isso mantém a proteção contra usuário comum se auto-promover (anon/authenticated continuam bloqueados), mas libera as funções de servidor confiáveis (`team.functions.ts` / `clinics.functions.ts`) que são, elas mesmas, protegidas por `requireClinicAdmin` / `requireSuperAdmin`.

Pseudo-SQL:

```text
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
...
DECLARE
  _claims jsonb := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  _is_service_role boolean := COALESCE(_claims->>'role','') = 'service_role';
BEGIN
  IF _is_service_role OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  -- restante das checagens permanece igual
END;
```

Também remover o gatilho duplicado `profiles_prevent_escalation` (existem dois apontando para a mesma função em `public.profiles`).

### 2. UI — mostrar a mensagem real do erro

Em `src/routes/_app/equipe.tsx`, trocar `toast.error("Erro")` no `NewMemberDialog.submit` por `toast.error(err instanceof Error ? err.message : "Erro")`, igual já é feito nas mutations `delMut` / `roleMut`. Isso evita futuras situações de "só aparece Erro" sem explicação.

## Fora de escopo

- Não mexer em RLS de `patients` / `attendances` (já está correto, inclui `operador`).
- Não alterar `team.functions.ts` (a guarda `requireClinicAdmin` já restringe quem chama).
- Não criar permissões granulares novas.
