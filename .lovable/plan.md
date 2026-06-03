## Problema

Hoje existem dois arquivos no mesmo nível:

- `src/routes/_app/pacientes.tsx` → tela com a lista
- `src/routes/_app/pacientes.$id.tsx` → tela de detalhes

Pela convenção do TanStack Router, `pacientes.tsx` vira **rota pai** de `pacientes/$id`. Como `pacientes.tsx` renderiza a lista e **não** tem um `<Outlet />`, ao navegar para `/pacientes/<id>` o roteador casa a rota filha, mas não há onde renderizá-la — então a tela continua mostrando a lista de pacientes, sem o histórico nem o botão de editar.

Confirmado em `src/routeTree.gen.ts`: o tipo `AppPacientesRouteWithChildren` mostra que a lista está sendo tratada como layout.

## Correção

Transformar a lista numa rota **irmã** do detalhe, em vez de pai.

1. Renomear `src/routes/_app/pacientes.tsx` → `src/routes/_app/pacientes.index.tsx`
   - Conteúdo permanece idêntico (mesma `PacientesPage`, mesmo `head`, etc.).
   - Apenas trocar `createFileRoute("/_app/pacientes")` por `createFileRoute("/_app/pacientes/")` (a `/` final é a convenção de index).
2. Manter `src/routes/_app/pacientes.$id.tsx` inalterado.
3. O `routeTree.gen.ts` é regenerado automaticamente pelo plugin — não editar.

Depois disso:
- `/pacientes` continua mostrando a listagem.
- `/pacientes/<id>` mostra a página de detalhes completa (cards de dados, histórico, modais de novo/editar/excluir atendimento, editar paciente).

## Fora de escopo
- Não alterar layout, textos, queries, RLS, migrações nem o conteúdo da página de detalhes (já estava certo).
- Sidebar e link "Pacientes" continuam apontando para `/pacientes`.
