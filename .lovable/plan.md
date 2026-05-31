
## Objetivo

1. Aplicar nova identidade visual (paleta teal, cards 16px, sidebar 280px, Inter) em todas as telas, mantendo 100% das funcionalidades, rotas, lógica, banco e APIs.
2. Substituir o fluxo "Super Admin cria senha do admin da clínica" por um fluxo de convite por e-mail (mais seguro), com primeiro acesso por link único e suporte a login com Google usando o mesmo e-mail.

---

## Parte 1 — Redesign visual (somente UI)

### Design tokens (`src/styles.css`)

Reescrever os tokens em `:root` para a nova paleta (mantendo formato `oklch` para compatibilidade com Tailwind):

- `--primary` → teal `#1FA4A5`
- `--ring` → mesmo teal
- `--background` → `#F5F7FA`
- `--card` / `--popover` → `#FFFFFF`
- `--foreground` → `#0F172A`
- `--muted-foreground` → `#64748B`
- `--border` / `--input` → `#E2E8F0`
- `--success` → `#22C55E`
- `--destructive` → `#EF4444`
- `--warning` → âmbar suave
- `--radius` → `1rem` (16px) — botões/inputs usam `rounded-xl` (12px)
- Sidebar tokens (`--sidebar`, `--sidebar-primary`, `--sidebar-accent`) alinhados ao novo esquema
- Adicionar `--shadow-card: 0 1px 2px rgba(0,0,0,.05), 0 4px 12px rgba(0,0,0,.04)` e classe utilitária `.shadow-card`
- Importar Inter via `<link>` no `src/routes/__root.tsx` `head()` e definir `font-family: Inter` no `body`

Versão dark mantida (apenas ajustada para a nova primária).

### Componentes shadcn ajustados

- `Card` ganha `rounded-2xl border-border shadow-card`
- `Button` variant `default`: `rounded-xl`, hover `bg-[--primary-hover]` (via novo token `--primary-hover`)
- `Input`/`Select`/`Textarea`: `rounded-xl h-10`
- `Badge` ganha variantes `success` (verde claro), `warning` (amarelo claro), `danger` (vermelho claro), todas pill (`rounded-full`)
- `Table`: header `bg-[#F8FAFC] text-muted-foreground`, linhas com hover, container `rounded-2xl overflow-hidden border`

### Layout app (`src/routes/_app.tsx`)

- Sidebar fixa 280px (`--sidebar-width: 17.5rem`), itens com `rounded-xl`, ativo `bg-primary text-primary-foreground`, hover `bg-[#F1F5F9]`
- Itens mantidos por perfil: Dashboard, Pacientes, Equipe (admin)
- Rodapé da sidebar: avatar com inicial, e-mail, papel (`Admin`/`Contador`/`Usuário`), botão "Sair" — fixado no bottom
- Header interno: título + subtítulo da página (via slot — cada rota passa `<PageHeader title subtitle />`) e badge de vencimento
- Fundo `#F5F7FA`

### Telas redesenhadas (sem mudar texto/rotas/lógica)

- **Login** (`/login`): card centralizado, logo teal, mesmos campos. Adiciona botão "Entrar com Google" (ver Parte 2).
- **Dashboard** (`/_app/dashboard`): 4 KPI cards 140px (Total faturado, Pendentes, CPF Inválido, Emitidos), card grande "Últimos atendimentos" com filtros já existentes (ano/mês/dia) reestilizados, tabela com novos badges, estado vazio centralizado com ícone.
- **Pacientes** (`/_app/pacientes`): header + barra de busca + botão "Novo paciente", tabela moderna, paginação/ações inline mantidas.
- **Paciente detalhe** (`/_app/pacientes/$id`): botão voltar + nome em destaque + subtítulo, card "Dados Cadastrais" + botão Editar, card "Histórico de Atendimentos" com tabela e botão "Novo atendimento" (reaproveita dialog existente).
- **Equipe** (`/_app/equipe`): card com tabela de membros (select de papel mantido).
- **Master Admin** (`/master-admin`): KPI cards + tabela de clínicas com novo visual; dialog "Nova clínica" simplificado (ver Parte 2 — sem campo de senha).
- **Bloqueio** (`/bloqueio`): card centralizado com tom de alerta.

Nenhuma string visível é alterada. Nenhuma rota é adicionada/removida (apenas a rota pública `/aceitar-convite` da Parte 2, que é nova funcionalidade pedida pelo usuário).

---

## Parte 2 — Novo fluxo Super Admin (convite por e-mail + Google)

### Visão

Em vez de o Super Admin digitar a senha do admin da clínica, ele cadastra apenas **Nome da clínica + E-mail do admin + Vencimento + Status**. O sistema:

1. Cria a clínica.
2. Cria o usuário no Auth via `inviteUserByEmail` (admin API), passando `redirectTo` para `/aceitar-convite`. Isso envia um e-mail com link único e seguro (token gerenciado pelo Supabase Auth).
3. No primeiro acesso, o admin define a senha em `/aceitar-convite`. Daí em diante pode entrar com **e-mail/senha** OU **Google** (mesmo e-mail → mesma conta, pois o e-mail já está confirmado pelo convite).

Vantagens vs. estado atual: Super Admin nunca conhece/digita senha; token é de uso único e expira; sem necessidade de comunicar credenciais por canais inseguros.

### Mudanças de servidor (sem alterar banco/RLS)

`src/lib/clinics.functions.ts`:
- `createClinicWithAdmin`: remover `adminPassword` do `inputValidator`. Trocar `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })` por:
  ```ts
  supabaseAdmin.auth.admin.inviteUserByEmail(adminEmail, {
    data: { role: "admin", clinic_id: clinic.id },
    redirectTo: `${process.env.APP_PUBLIC_URL ?? "https://patronus-flow.lovable.app"}/aceitar-convite`,
  })
  ```
  (O trigger `handle_new_user` já lê `raw_user_meta_data.role` e `clinic_id`, então o profile é criado corretamente.)
- Nova função `resendClinicAdminInvite({ clinicId })` (super-admin only) para reenviar o convite caso o e-mail expire — usa o mesmo `inviteUserByEmail`.

### Mudanças de UI

- `NewClinicDialog` em `src/routes/master-admin.tsx`: remover campo "Senha"; manter Nome, E-mail, Vencimento, Status. Toast de sucesso: "Convite enviado para {email}".
- Adicionar ação "Reenviar convite" na linha da clínica (visível apenas quando há admin pendente — heurística simples: admin existe). Reaproveita `InlineAction`.

### Nova rota pública `/aceitar-convite`

`src/routes/aceitar-convite.tsx`:
- Página pública (não passa por `_authenticated`).
- Lê hash do link (`access_token`/`refresh_token` ou `type=invite`) que o Supabase coloca — `supabase-js` processa automaticamente.
- Mostra formulário "Definir senha" + "Confirmar senha" → `supabase.auth.updateUser({ password })`.
- Mostra também botão "Continuar com Google" (mesmo e-mail vincula automaticamente quando confirmado).
- Após sucesso, redireciona para `/dashboard`.

### Login com Google (tela `/login` e `/aceitar-convite`)

- Botão "Entrar com Google" usando o broker gerenciado:
  ```ts
  import { lovable } from "@/integrations/lovable";
  await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
  ```
- No mesmo turno, habilitar provider Google via `supabase--configure_social_auth({ providers: ["google"] })`. **E-mail/senha permanece habilitado** (não desabilitar).

### Restrição de auto-cadastro

Manter `disable_signup: true` para garantir que apenas convites criem contas. (O `inviteUserByEmail` funciona mesmo com signup desabilitado pois usa a admin API.)

---

## Detalhes técnicos

**Arquivos a editar:**
- `src/styles.css` — tokens da nova paleta + Inter + sombra
- `src/routes/__root.tsx` — `<link>` Inter
- `src/components/ui/{button,card,input,table,badge,select,textarea}.tsx` — radius/cores/shadow
- `src/routes/_app.tsx` — sidebar 280px, rodapé com perfil, header com slot
- `src/routes/_app/{dashboard,pacientes,pacientes.$id,equipe}.tsx` — aplicar novo layout (sem mudar lógica)
- `src/routes/{login,master-admin,bloqueio}.tsx` — novo visual
- `src/lib/clinics.functions.ts` — remover senha, usar `inviteUserByEmail`, adicionar `resendClinicAdminInvite`
- `src/routes/aceitar-convite.tsx` — **novo** (definir senha após convite)

**Arquivos NÃO tocados:** `client.ts`, `client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts`, `types.ts`, migrations, RLS, `attendances.functions.ts`, `patients.functions.ts`, `team.functions.ts`, `session.functions.ts`.

**Banco:** sem migrations. O trigger `handle_new_user` já popula `profiles` a partir de `raw_user_meta_data` enviado pelo `inviteUserByEmail`.

**E-mails de convite:** usam o sistema padrão do Supabase Auth (template "Invite user"). Não precisa configurar domínio de e-mail customizado para isso funcionar — opcional como passo futuro.

**Configuração de auth necessária após implementar:**
- Habilitar Google provider (chamada automática).
- `disable_signup: true` permanece (já está).
- `auto_confirm_email` permanece como está.
