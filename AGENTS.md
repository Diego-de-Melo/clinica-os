# AGENTS.md

## Stack

TanStack Start (SSR) + React 19 + Vite 7 + Cloudflare Workers + Supabase + Tailwind CSS v4 + shadcn/ui.
Package manager: **Bun**. Dev platform: **Lovable** (managed Vite config).

## Commands

- `bun run dev` — Vite dev server
- `bun run build` — Production build (Cloudflare Workers)
- `bun run build:dev` — Development build
- `bun run lint` — ESLint
- `bun run format` — Prettier (write)
- `bun run test` — Vitest (single run)
- `bun run test:watch` — Vitest (watch)

Tests only cover `src/lib/` utility functions (auth-guards, clinic-utils, rls-policies). Tests run in `node` environment.

## Auto-generated files — DO NOT EDIT

- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/client.server.ts`
- `src/integrations/supabase/auth-attacher.ts`
- `src/routeTree.gen.ts`

## Supabase clients

Two clients, different security models:

- `supabase` from `@/integrations/supabase/client` — browser client, respects RLS. Use in UI components and client-side hooks.
- `supabaseAdmin` from `@/integrations/supabase/client.server` — server-only, service role key, **bypasses RLS**. Use in `*.server.ts` files and server functions for admin operations only.

Client env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
Server env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Server functions

Created with `createServerFn()` from `@tanstack/react-start`. Middleware chains are registered in `src/start.ts`:
- `errorMiddleware` — catches and renders branded error pages
- `attachSupabaseAuth` — forwards bearer token to server RPCs (registered globally)

## Roles & access

Five roles: `super_admin`, `admin`, `contador`, `operador`, `usuario`.
- `super_admin` → global admin panel (`/master-admin`), excluded from clinic data
- `admin` → full clinic access, manages patients and attendances
- `contador` → can write attendances, read-only for patients
- `operador` → can write patients and attendances
- `usuario` → read-only

Route guards: `requireAppSession()`, `requireSuperAdminSession()` in `src/lib/route-auth.ts`.
Role assertions in `src/lib/auth-guards.ts`:
- `assertAdminRole()` — admin only
- `assertPatientWriter()` — admin or operador
- `assertAttendanceWriter()` — admin or operador
- `assertStaffRole()` — admin, contador, or operador

## Path alias

`@/*` → `./src/*` (configured in tsconfig.json, used everywhere).

## Vite config

`vite.config.ts` uses `@lovable.dev/vite-tanstack-config` which **already includes** these plugins — do NOT add them manually:
- tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare, componentTagger
- `@` path alias, React/TanStack dedupe, error logger, sandbox detection

Override only via `defineConfig({ vite: { ... } })` or `defineConfig({ tanstackStart: { ... } })`.

## Deploy

Cloudflare Workers via `@cloudflare/vite-plugin`. Config in `wrangler.jsonc`.
Server entry is redirected to `src/server.ts` (wraps h3 errors with branded error pages).

## Formatting

- Prettier: 100 char width, semicolons, double quotes, trailing commas
- ESLint: prettier integration, react-hooks, react-refresh, typescript-eslint
- `server-only` import is banned — use `*.server.ts` suffix or `@tanstack/react-start/server-only` instead

## Bun supply-chain guard

`bunfig.toml` enforces a 24-hour minimum release age for packages.
Bypass exclusions: `@lovable.dev/vite-tanstack-config`.
If a `bun install` fails for a new package, it needs an explicit exclusion added to `minimumReleaseAgeExcludes`.

## Server functions directory

- `src/lib/*.functions.ts` — client-callable server functions (use `createServerFn()`)
- `src/lib/*.server.ts` — server-only modules (bypass RLS, use `supabaseAdmin`)
- `src/routes/api/` — HTTP API routes (e.g., backup webhooks)

Key server modules:
- `audit.server.ts` — audit logging (server-only)
- `backup-crypto.server.ts` — encrypted backup encryption/decryption
- `backups.server.ts` — backup operations (server-only)

## UI components

shadcn/ui "new-york" style, Lucide icons, Tailwind CSS v4 with CSS variables.
Components live in `src/components/ui/`. Add via shadcn CLI — do not hand-write from scratch.

## Security checklist (T5)

Toda função `SECURITY DEFINER` nova precisa:
1. Predicado de `clinic_id` no corpo (ex.: `WHERE clinic_id = current_clinic_id()`).
2. `SET search_path` explícito (`''` quando tudo é `public.x`, senão `public, pg_temp`).
3. `REVOKE EXECUTE FROM PUBLIC, anon` na mesma migration.
4. Teste em `tests/rls/` cobrindo: cross-tenant, papel errado, clínica inativa.
