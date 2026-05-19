import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const requireClinicAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("role, clinic_id")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
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
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, role, created_at")
      .eq("clinic_id", context.clinicId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createTeamMember = createServerFn({ method: "POST" })
  .middleware([requireClinicAdmin])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(8).max(72),
        role: z.enum(["admin", "contador", "usuario"]).default("usuario"),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    if (!context.clinicId) throw new Error("Sem clínica");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { role: data.role, clinic_id: context.clinicId },
    });
    if (error) throw new Error(error.message);
    return { ok: true, userId: created.user?.id };
  });

export const deleteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireClinicAdmin])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("clinic_id, id")
      .eq("id", data.id)
      .maybeSingle();
    if (!target || target.clinic_id !== context.clinicId) {
      throw new Error("Membro não pertence à sua clínica");
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
