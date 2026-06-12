import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { throwDatabaseError, throwServiceError } from "@/lib/safe-errors";

type TeamRole = "admin" | "contador" | "operador" | "usuario";

async function getSupabaseAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function isEmailAlreadyRegisteredError(error: { code?: string | null; message?: string | null }) {
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "email_exists" ||
    message.includes("already been registered") ||
    message.includes("already registered")
  );
}

async function findAuthUserByEmail(email: string) {
  const admin = await getSupabaseAdmin();
  const normalizedEmail = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throwServiceError(error, "Não foi possível verificar o e-mail informado.");
    const user = data.users.find((item) => item.email?.trim().toLowerCase() === normalizedEmail);
    if (user) return user;
    if (!data.nextPage || data.users.length === 0) return null;
  }
  return null;
}

async function assertUserCanJoinClinic(userId: string, clinicId: string) {
  const admin = await getSupabaseAdmin();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("clinic_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throwDatabaseError(profileError);
  if (profile?.clinic_id && profile.clinic_id !== clinicId) {
    throw new Error("Este e-mail já está vinculado a outra clínica.");
  }
}

async function ensureClinicProfile({
  userId,
  email,
  role,
  clinicId,
}: {
  userId: string;
  email: string;
  role: TeamRole;
  clinicId: string;
}) {
  await assertUserCanJoinClinic(userId, clinicId);
  const admin = await getSupabaseAdmin();
  const { error } = await admin
    .from("profiles")
    .upsert({ id: userId, email, role, clinic_id: clinicId }, { onConflict: "id" });
  if (error) throwDatabaseError(error);
}

const requireClinicAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("role, clinic_id")
      .eq("id", userId)
      .maybeSingle();
    if (error) throwDatabaseError(error);
    if (!data) throw new Error("Perfil não encontrado");
    if (data.role !== "admin" && data.role !== "super_admin") {
      throw new Error("Apenas Admin pode gerenciar a equipe");
    }
    return next({ context: { clinicId: data.clinic_id, role: data.role } });
  });
export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireClinicAdmin])
  .handler(async ({ context }) => {
    if (!context.clinicId) return [];
    const admin = await getSupabaseAdmin();
    const { data, error } = await admin
      .from("profiles")
      .select("id, email, role, created_at")
      .eq("clinic_id", context.clinicId)
      .order("created_at", { ascending: false });
    if (error) throwDatabaseError(error);
    return data ?? [];
  });

export const createTeamMember = createServerFn({ method: "POST" })
  .middleware([requireClinicAdmin])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(8).max(72),
        role: z.enum(["admin", "contador", "operador", "usuario"]).default("usuario"),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    if (!context.clinicId) throw new Error("Sem clínica");
    const admin = await getSupabaseAdmin();
    const email = data.email.trim().toLowerCase();
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { role: data.role, clinic_id: context.clinicId },
    });
    if (error) {
      if (!isEmailAlreadyRegisteredError(error)) {
        throwServiceError(error);
      }
      const existingUser = await findAuthUserByEmail(email);
      if (!existingUser) {
        throw new Error("Este e-mail já existe, mas não foi possível localizar o cadastro.");
      }
      await assertUserCanJoinClinic(existingUser.id, context.clinicId);
      const { error: updateError } = await admin.auth.admin.updateUserById(
        existingUser.id,
        {
          password: data.password,
          user_metadata: { role: data.role, clinic_id: context.clinicId },
        },
      );
      if (updateError) {
        throwServiceError(updateError, "Não foi possível atualizar o acesso deste membro.");
      }
      await ensureClinicProfile({
        userId: existingUser.id,
        email,
        role: data.role,
        clinicId: context.clinicId,
      });
      return { ok: true, userId: existingUser.id };
    }
    if (!created.user?.id) throw new Error("Não foi possível criar o usuário.");
    await ensureClinicProfile({
      userId: created.user.id,
      email,
      role: data.role,
      clinicId: context.clinicId,
    });
    return { ok: true, userId: created.user.id };
  });

export const updateTeamMemberRole = createServerFn({ method: "POST" })
  .middleware([requireClinicAdmin])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        role: z.enum(["admin", "contador", "operador", "usuario"]),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const admin = await getSupabaseAdmin();
    const { data: target } = await admin
      .from("profiles")
      .select("clinic_id, id")
      .eq("id", data.id)
      .maybeSingle();
    if (!target || target.clinic_id !== context.clinicId) {
      throw new Error("Membro não pertence à sua clínica");
    }
    const { error } = await admin
      .from("profiles")
      .update({ role: data.role })
      .eq("id", data.id);
    if (error) throwDatabaseError(error);
    return { ok: true };
  });

export const deleteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireClinicAdmin])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const admin = await getSupabaseAdmin();
    const { data: target } = await admin
      .from("profiles")
      .select("clinic_id, id")
      .eq("id", data.id)
      .maybeSingle();
    if (!target || target.clinic_id !== context.clinicId) {
      throw new Error("Membro não pertence à sua clínica");
    }
    const { error } = await admin.auth.admin.deleteUser(data.id);
    if (error) throwDatabaseError(error);
    return { ok: true };
  });
