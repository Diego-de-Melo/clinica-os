/**
 * Harness de integração para testes de RLS contra o Supabase local.
 *
 * Pré-requisitos (ver `docs/testing-rls.md`):
 *   1. Docker Desktop rodando
 *   2. `supabase start`
 *   3. `supabase db reset` (aplica todas as migrations)
 *   4. `npm run test:rls`
 *
 * As chaves são lidas de SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY /
 * SUPABASE_TEST_SERVICE_KEY quando existirem; caso contrário caem no
 * `supabase status --output json` da stack local.
 */
import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Stack = { url: string; anonKey: string; serviceKey: string };

export type AppRole =
  | "super_admin"
  | "admin"
  | "user"
  | "contador"
  | "usuario"
  | "operador";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

const AUTH_OPTS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

/* ------------------------------------------------------------------ stack */

let stackPromise: Promise<Stack> | null = null;

export function startStack(): Promise<Stack> {
  stackPromise ??= resolveStack();
  return stackPromise;
}

async function resolveStack(): Promise<Stack> {
  const env = process.env;
  if (env.SUPABASE_TEST_URL && env.SUPABASE_TEST_ANON_KEY && env.SUPABASE_TEST_SERVICE_KEY) {
    return {
      url: env.SUPABASE_TEST_URL,
      anonKey: env.SUPABASE_TEST_ANON_KEY,
      serviceKey: env.SUPABASE_TEST_SERVICE_KEY,
    };
  }

  const status = supabaseStatusJson();
  return {
    url: pick(status, ["API_URL", "API URL", "api_url", "ApiUrl"]),
    anonKey: pick(status, ["ANON_KEY", "anon key", "anon_key"]),
    serviceKey: pick(status, ["SERVICE_ROLE_KEY", "SERVICE_KEY", "service_role_key"]),
  };
}

function supabaseStatusJson(): Record<string, unknown> {
  const commands =
    process.platform === "win32"
      ? ["supabase status --output json", "npx supabase status --output json"]
      : ["supabase status --output json"];

  const failures: string[] = [];
  for (const command of commands) {
    try {
      const out = execSync(command, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60_000,
        windowsHide: true,
      });
      const clean = stripAnsi(out);
      const start = clean.indexOf("{");
      if (start < 0) throw new Error(`saída sem JSON: ${clean.slice(0, 200)}`);
      return JSON.parse(clean.slice(start)) as Record<string, unknown>;
    } catch (error) {
      failures.push(`${command} -> ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(
    "Supabase local indisponível. Rode `supabase start` e `supabase db reset` " +
      "(ou exporte SUPABASE_TEST_URL/ANON_KEY/SERVICE_KEY).\n" +
      failures.join("\n"),
  );
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function pick(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  throw new Error(
    `campo ausente no \`supabase status\` (tentativas: ${keys.join(", ")}). ` +
      `Disponíveis: ${Object.keys(source).join(", ")}`,
  );
}

/* ----------------------------------------------------------------- clientes */

export async function serviceClient(): Promise<SupabaseClient> {
  const stack = await startStack();
  return createClient(stack.url, stack.serviceKey, AUTH_OPTS);
}

export async function anonClient(): Promise<SupabaseClient> {
  const stack = await startStack();
  return createClient(stack.url, stack.anonKey, AUTH_OPTS);
}

/** Cliente "de usuário": JWT de sessão no header Authorization, como o servidor faz. */
export async function signInAs(email: string, password: string): Promise<SupabaseClient> {
  const stack = await startStack();
  const boot = await anonClient();
  const { data, error } = await boot.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`signInWithPassword(${email}) falhou: ${error?.message ?? "sem sessão"}`);
  }
  return createClient(stack.url, stack.anonKey, {
    ...AUTH_OPTS,
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

/* ------------------------------------------------------------------ tenants */

export type TenantOptions = {
  name?: string;
  role?: AppRole;
  status?: "ativo" | "inativo";
  /** `undefined` = 1 ano a partir de hoje; `null` = sem vencimento. */
  expirationDate?: string | null;
  /** raw_user_meta_data enviado no createUser — usado pelos testes de A8. */
  userMetadata?: Record<string, unknown>;
};

export type Tenant = {
  clinicId: string;
  userId: string;
  email: string;
  password: string;
  role: AppRole;
  client: SupabaseClient;
};

let seq = 0;

export async function createTenant(options: TenantOptions = {}): Promise<Tenant> {
  const svc = await serviceClient();
  seq += 1;
  const tag = `${Date.now().toString(36)}${seq}`;

  const expiration =
    options.expirationDate === undefined ? isoInDays(365) : options.expirationDate;

  const { data: clinic, error: clinicError } = await svc
    .from("clinics")
    .insert({
      name: options.name ?? `Clínica Teste ${tag}`,
      status: options.status ?? "ativo",
      expiration_date: expiration,
    })
    .select("id")
    .single();
  if (clinicError || !clinic) {
    throw new Error(`criar clínica falhou: ${clinicError?.message}`);
  }

  const role = options.role ?? "admin";
  const email = `tenant-${tag}@example.test`;
  const password = `Tst!${tag}x9`;

  const { data: created, error: userError } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: options.userMetadata ?? {},
  });
  if (userError || !created.user) {
    throw new Error(`criar usuário falhou: ${userError?.message}`);
  }
  const userId = created.user.id;

  // O trigger handle_new_user já criou um perfil; aqui garantimos tenant e papel.
  const { error: profileError } = await svc
    .from("profiles")
    .upsert({ id: userId, email, role, clinic_id: clinic.id });
  if (profileError) {
    throw new Error(`perfil do usuário falhou: ${profileError.message}`);
  }

  return {
    clinicId: clinic.id,
    userId,
    email,
    password,
    role,
    client: await signInAs(email, password),
  };
}

/* -------------------------------------------------------------------- seed */

export async function seedPatient(
  tenant: Tenant,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await tenant.client
    .from("patients")
    .insert({
      clinic_id: tenant.clinicId,
      name: `Paciente ${Date.now().toString(36)}`,
      cpf: "12345678900",
      ...overrides,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedPatient falhou: ${error?.message}`);
  return data.id as string;
}

export async function seedAttendance(
  tenant: Tenant,
  patientId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await tenant.client
    .from("attendances")
    .insert({
      clinic_id: tenant.clinicId,
      patient_id: patientId,
      date: "2026-09-27",
      value: 150,
      status: "agendado",
      invoice_for: "paciente",
      ...overrides,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedAttendance falhou: ${error?.message}`);
  return data.id as string;
}

/* ------------------------------------------------------------------- reset */

/** Zera as tabelas de dados e remove os usuários de auth (estado determinístico). */
export async function resetStack(): Promise<void> {
  const svc = await serviceClient();

  const clears: Array<[table: string, key: string]> = [
    ["attendances", "id"],
    ["patients", "id"],
    ["consents", "id"],
    ["audit_logs", "id"],
    ["backups", "id"],
    ["backup_configs", "clinic_id"],
    ["profiles", "id"],
    ["clinics", "id"],
  ];

  for (const [table, key] of clears) {
    const { error } = await svc.from(table).delete().neq(key, ZERO_UUID);
    if (error) throw new Error(`resetStack(${table}) falhou: ${error.message}`);
  }

  let page = 1;
  for (;;) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers falhou: ${error.message}`);
    for (const user of data.users) {
      const { error: deleteError } = await svc.auth.admin.deleteUser(user.id);
      if (deleteError && !/not found/i.test(deleteError.message)) {
        throw new Error(`deleteUser(${user.id}) falhou: ${deleteError.message}`);
      }
    }
    if (data.users.length < 200) break;
    page += 1;
  }
}

function isoInDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
