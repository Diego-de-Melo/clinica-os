<div align="center">

# ClinicaOS

**Gestão de pacientes, atendimentos e faturamento para clínicas — multi-tenant e protegido por RLS.**

![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![TanStack Start](https://img.shields.io/badge/TanStack_Start-SSR-1F1F1F)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20RLS-3FCF8E?logo=supabase&logoColor=white)
![Licença](https://img.shields.io/badge/Licen%C3%A7a-MIT-green)

[English](./README.en.md) · Português

</div>

## Sobre

Clínicas pequenas e médias ainda costumam controlar pacientes, atendimentos e a emissão de notas em planilhas compartilhadas. O problema aparece rápido: ninguém sabe qual atendimento já foi faturado, o CPF de um paciente está errado em várias linhas ao mesmo tempo e, pior, dados de saúde de várias empresas convivem no mesmo arquivo, sem isolamento nem histórico de quem alterou o quê.

O ClinicaOS é um SaaS B2B multi-tenant que resolve isso com um fluxo de faturamento explícito — **Pendente → CPF Inválido → Corrigido → Emitido** — aplicado sobre cadastro de pacientes, histórico de atendimentos e gestão da equipe da clínica. Cada clínica enxerga somente os próprios dados, garantido por políticas de Row Level Security no Supabase e por verificações de papel em cada server function. A conta é criada por convite, sem cadastro público, e cada clínica tem vencimento de assinatura controlado em um painel global.

Este é um projeto pensado para rodar de verdade em produção: renderização server-side com execução na edge (Cloudflare Workers), autorização em três camadas (banco, servidor e rota), testes automatizados na regra de acesso, auditoria das operações sensíveis, backup criptografado dos dados da clínica e páginas de erro com tratamento próprio.

## Demonstração

**Em produção:** [https://clinica-os-mdm24.vercel.app](https://clinica-os-mdm24.vercel.app) — SSR na Vercel com banco Supabase (RLS).

![Landing page do ClinicaOS](./docs/images/app-landing.png)

![Tela de login do ClinicaOS](./docs/images/app-login.png)

## Funcionalidades

- **Landing page pública** (`/`) — apresentação do produto com acesso por convite, sem cadastro público.
- **Autenticação** — email e senha, login social com Google (OAuth), recuperação de senha e definição de senha no primeiro acesso (`/aceitar-convite`).
- **Cinco papéis** — `super_admin`, `admin`, `operador`, `contador` e `usuario` (somente leitura), com guards de rota e asserções de papel por função.
- **Dashboard de faturamento** — lista de atendimentos com filtros por ano, mês e dia, além de cards com total faturado, pendentes, CPF inválido e emitidos.
- **Fluxo de status por papel** — os status `Pendente`, `CPF Inválido`, `Corrigido`, `Emitido` e `Cancelado` existem na tabela `attendances` (constraint no banco), e cada papel só enxerga as transições que pode executar.
- **Gestão de pacientes** — CRUD com CPF, CNPJ, razão social e dados de pai e mãe; busca por nome; importação em massa via CSV; página de detalhe com histórico de atendimentos.
- **Atendimentos** — criação, edição e exclusão, com "emitir para" (paciente, pai, mãe ou CNPJ da empresa), método de pagamento, valor e data.
- **Equipe da clínica** (`/equipe`) — cadastro de membros, alteração de papel e remoção, restrito a admin.
- **Backups** (`/backups`) — snapshot diário automático (03h), criptografia AES-256-GCM, retenção de 30, 90 ou 365 dias, geração manual, download e restauração, com webhook protegido para execução agendada.
- **Painel global** (`/master-admin`) — criação de clínica junto com o admin, edição, ativação/inativação e definição de vencimento.
- **Logs de auditoria** (`/master-admin.logs`) — filtros por clínica, ação, email e período, configuração de retenção e exportação em CSV.
- **Auditoria e LGPD** — registro de auditoria nas operações sensíveis, exportação e anonimização de dados do paciente, registro de consentimentos e exclusão lógica (soft delete) de atendimentos.
- **Telas de estado** — 404, página de erro do servidor com tratamento próprio e tela de bloqueio para clínicas inativas ou vencidas.

## Stack

| Tecnologia | Para quê |
| --- | --- |
| [TanStack Start](https://tanstack.com/start) | SSR com rotas file-based, server functions e middleware |
| [TanStack Router](https://tanstack.com/router) | Navegação tipada com guards de rota e redirect automático |
| [TanStack Query](https://tanstack.com/query) | Cache e invalidação das mutações/consultas |
| React 19 | Interface e hooks da aplicação |
| Vite 7 | Dev server e build de produção |
| Cloudflare Workers | Runtime de borda para o SSR (`wrangler.jsonc`) |
| Supabase | Banco Postgres, autenticação, storage e RLS |
| Tailwind CSS v4 | Estilização utilitária com variáveis de tema |
| shadcn/ui + Radix UI | Componentes acessíveis no estilo "new-york" |
| Zod | Validação de entrada de todas as server functions |
| Vitest | Testes das regras de acesso e utilidades |
| Bun | Gerenciador de pacotes e scripts do projeto |
| Prettier + ESLint | Formatação e lint (com plugin do Prettier) |

## Estrutura do projeto

```text
.
├── src/
│   ├── routes/                  # Rotas file-based (TanStack Router)
│   │   ├── __root.tsx           # Shell HTML, meta, providers e páginas de erro
│   │   ├── index.tsx            # Landing pública
│   │   ├── login.tsx            # Login por email/senha e Google
│   │   ├── aceitar-convite.tsx  # Primeiro acesso / redefinição de senha
│   │   ├── bloqueio.tsx         # Conta bloqueada ou vencida
│   │   ├── master-admin.tsx     # Painel global de clínicas (super admin)
│   │   ├── master-admin.logs.tsx# Logs de auditoria
│   │   ├── _app.tsx             # Layout autenticado (sidebar, sessão, logout)
│   │   ├── _app/                # dashboard, pacientes (lista e detalhe), equipe, backups
│   │   └── api/public/hooks/    # Webhook de backups agendados
│   ├── components/              # Componentes de domínio (patient-combobox, row-actions)
│   │   └── ui/                  # shadcn/ui (gerados pelo CLI)
│   ├── hooks/                   # use-session, use-mobile
│   ├── lib/                     # Regra de negócio e server functions
│   │   ├── *.functions.ts       # Server functions chamáveis pelo cliente
│   │   ├── *.server.ts          # Módulos server-only (service role, criptografia)
│   │   └── *.test.ts            # Testes Vitest (auth-guards, clinic-utils, rls-policies)
│   ├── integrations/
│   │   ├── supabase/            # Clientes browser/server, middleware e types do banco
│   │   └── lovable/             # Login social (OAuth Google)
│   ├── start.ts                 # Middleware global (erros + token de auth)
│   ├── server.ts                # Entrada do servidor (erros com página própria)
│   └── styles.css               # Tailwind CSS v4 e variáveis de tema
├── supabase/
│   ├── migrations/              # Schema, políticas RLS, funções e triggers
│   └── config.toml
├── wrangler.jsonc               # Configuração do Cloudflare Workers
├── vite.config.ts               # Config do Vite/TanStack Start
├── vitest.config.ts             # Config dos testes (ambiente node)
├── bunfig.toml                  # Guarda de supply-chain do Bun (release age de 24h)
└── AGENTS.md                    # Convenções do projeto
```

## Como rodar

### Pré-requisitos

- [Bun](https://bun.sh) — gerenciador de pacotes usado no projeto.
- Um projeto Supabase com as migrações de `supabase/migrations` aplicadas.
- (Opcional) Conta Cloudflare Workers para o deploy de produção.

### Instalação

```bash
git clone https://github.com/<seu_usuario>/clinica-os.git
cd clinica-os
bun install
cp .env.example .env   # preencha as variáveis do seu projeto Supabase
bun run dev
```

### Comandos

| Comando | O que faz |
| --- | --- |
| `bun run dev` | Servidor de desenvolvimento (Vite) |
| `bun run build` | Build de produção (Cloudflare Workers) |
| `bun run build:dev` | Build em modo de desenvolvimento |
| `bun run preview` | Pré-visualiza o build |
| `bun run lint` | ESLint |
| `bun run format` | Prettier (formata o código) |
| `bun run test` | Vitest (execução única) |
| `bun run test:watch` | Vitest em modo watch |

### Variáveis de ambiente

O projeto lê as variáveis abaixo (veja `.env.example`):

| Nome | Descrição |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto Supabase usada pelo cliente do navegador |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave pública usada no navegador (respeita RLS) |
| `VITE_SUPPORT_EMAIL` | (Opcional) E-mail exibido nos botões de contato — sem valor, os botões ficam ocultos |
| `SUPABASE_URL` | URL do Supabase usada no servidor (SSR e server functions) |
| `SUPABASE_PUBLISHABLE_KEY` | Chave pública usada no servidor para validar a sessão |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de service role, somente servidor — contorna RLS e autentica o webhook de backups |
| `BACKUP_ENCRYPTION_KEY` | Chave de 32 bytes (base64, hex ou texto) usada para criptografar os backups em AES-256-GCM |

## Destaques técnicos

- **Isolamento multi-tenant no banco.** Todas as tabelas de negócio carregam `clinic_id` e têm políticas de Row Level Security no Supabase. O cliente do navegador usa a chave pública e, por isso, só enxerga os dados da própria clínica; a chave de service role fica restrita a módulos `*.server.ts`.
- **Autorização em três camadas.** Políticas RLS no Postgres, asserções de papel nas server functions (`assertAdminRole`, `assertPatientWriter`, `assertAttendanceWriter`, `assertStaffRole`) e guards de rota (`requireAppSession`, `requireSuperAdminSession`) que redirecionam para login, bloqueio ou painel global conforme o contexto.
- **Transições de faturamento por papel.** As mudanças de status não são um botão genérico: cada papel recebe apenas as transições que pode executar (por exemplo, o contador emite e marca CPF inválido; admin e operador corrigem o CPF), e o super admin fica de fora dos dados clínicos.
- **SSR com execução na edge.** TanStack Start com server functions, middleware global de erro (página própria em status 500) e encaminhamento do token de autenticação para as chamadas de servidor, compilado para Cloudflare Workers.
- **Testes automatizados na regra de acesso.** Vitest cobre `auth-guards`, `clinic-utils` e a matriz de RLS/papéis — justamente o que costuma quebrar sem ninguém perceber.
- **Auditoria e LGPD.** Função `log_audit` registrando as operações sensíveis, exportação e anonimização de dados do paciente, tabela de consentimentos, soft delete de atendimentos e remoção do acesso do super admin aos dados clínicos.
- **Backup criptografado e versionado.** Snapshots em AES-256-GCM com checksum, versionamento por clínica, retenção configurável, restauração e webhook de execução agendada autenticado por service key.
- **Qualidade de código.** Validação com Zod em toda server function, erros padronizados em módulo próprio, ESLint + Prettier e guarda de supply-chain do Bun (pacotes com pelo menos 24h de publicação).

## Licença

Distribuído sob a licença MIT.
