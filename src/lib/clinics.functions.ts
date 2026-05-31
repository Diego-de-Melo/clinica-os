import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Guard: only super admin can run these
const requireSuperAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.role !== "super_admin") {
      throw new Error("Apenas Super Admin pode executar esta ação.");
    }
    return next();
  });

export const listClinics = createServerFn({ method: "GET" })
  .middleware([requireSuperAdmin])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("clinics")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // also fetch counts and admin emails
    const ids = (data ?? []).map((c) => c.id);
    let adminsByClinic: Record<string, string[]> = {};
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("clinic_id, email, role")
        .in("clinic_id", ids);
      for (const p of profs ?? []) {
        if (!p.clinic_id) continue;
        adminsByClinic[p.clinic_id] ||= [];
        if (p.role === "admin") adminsByClinic[p.clinic_id].push(p.email);
      }
    }
    return (data ?? []).map((c) => ({
      ...c,
      admins: adminsByClinic[c.id] ?? [],
    }));
  });

export const createClinicWithAdmin = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        adminEmail: z.string().email(),
        expirationDate: z.string().datetime().nullable().optional(),
        status: z.enum(["ativo", "inativo"]).default("inativo"),
        redirectTo: z.string().url().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: clinic, error: cErr } = await supabaseAdmin
      .from("clinics")
      .insert({
        name: data.name,
        status: data.status,
        expiration_date: data.expirationDate ?? null,
      })
      .select()
      .single();
    if (cErr) throw new Error(cErr.message);

    const { data: invited, error: uErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(data.adminEmail, {
        data: { role: "admin", clinic_id: clinic.id },
        redirectTo: data.redirectTo,
      });
    if (uErr) {
      await supabaseAdmin.from("clinics").delete().eq("id", clinic.id);
      throw new Error(uErr.message);
    }

    return { clinic, userId: invited.user?.id };
  });

export const resendClinicAdminInvite = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((input) =>
    z
      .object({
        clinicId: z.string().uuid(),
        redirectTo: z.string().url().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: profs, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("email, role")
      .eq("clinic_id", data.clinicId);
    if (pErr) throw new Error(pErr.message);
    const admin = (profs ?? []).find((p) => p.role === "admin");
    if (!admin?.email) throw new Error("Nenhum admin encontrado para esta clínica.");

    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(admin.email, {
      data: { role: "admin", clinic_id: data.clinicId },
      redirectTo: data.redirectTo,
    });
    if (error) throw new Error(error.message);
    return { ok: true, email: admin.email };
  });

export const updateClinic = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(2).max(120).optional(),
        status: z.enum(["ativo", "inativo"]).optional(),
        expirationDate: z.string().datetime().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const patch: {
      name?: string;
      status?: string;
      expiration_date?: string | null;
    } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.status !== undefined) patch.status = data.status;
    if (data.expirationDate !== undefined)
      patch.expiration_date = data.expirationDate;
    const { error } = await supabaseAdmin
      .from("clinics")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteClinic = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    // delete associated auth users
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("clinic_id", data.id);
    for (const p of profs ?? []) {
      await supabaseAdmin.auth.admin.deleteUser(p.id).catch(() => {});
    }
    const { error } = await supabaseAdmin
      .from("clinics")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
