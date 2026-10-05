import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { throwDatabaseError, throwServiceError } from "@/lib/safe-errors";
import { assertAllowedRedirect } from "@/lib/csv";

const logAuditInternal: typeof import("@/lib/audit.server").logAuditInternal = async (...args) =>
  (await import("@/lib/audit.server")).logAuditInternal(...args);

async function getSupabaseAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

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
    if (error) throwDatabaseError(error);
    if (data?.role !== "super_admin") {
      throw new Error("Apenas Super Admin pode executar esta ação.");
    }
    return next();
  });

export const listClinics = createServerFn({ method: "GET" })
  .middleware([requireSuperAdmin])
  .handler(async () => {
    const admin = await getSupabaseAdmin();
    const { data, error } = await admin
      .from("clinics")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throwDatabaseError(error);

    const ids = (data ?? []).map((c) => c.id);
    const adminsByClinic: Record<string, string[]> = {};
    if (ids.length) {
      const { data: profs } = await admin
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
      .superRefine((data, ctx) => {
        if (data.redirectTo) {
          try {
            assertAllowedRedirect(data.redirectTo, [
              process.env.APP_ORIGIN ?? "",
              process.env.VITE_APP_ORIGIN ?? "",
            ].filter(Boolean));
          } catch (e) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: e instanceof Error ? e.message : "URL de redirecionamento não permitida",
              path: ["redirectTo"],
            });
          }
        }
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await getSupabaseAdmin();
    const { data: clinic, error: cErr } = await admin
      .from("clinics")
      .insert({
        name: data.name,
        status: data.status,
        expiration_date: data.expirationDate ?? null,
      })
      .select()
      .single();
    if (cErr) throwDatabaseError(cErr);

    const { data: invited, error: uErr } = await admin.auth.admin.inviteUserByEmail(
      data.adminEmail,
      {
        data: { role: "admin", clinic_id: clinic.id },
        redirectTo: data.redirectTo,
      },
    );
    if (uErr) {
      await admin.from("clinics").delete().eq("id", clinic.id);
      throwServiceError(uErr, "Não foi possível enviar o convite.");
    }

    await logAuditInternal(context.supabase, {
      action: "clinic.create",
      entity: "clinic",
      recordId: clinic.id,
      metadata: { name: data.name, admin_email: data.adminEmail, status: data.status },
    });

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
      .superRefine((data, ctx) => {
        if (data.redirectTo) {
          try {
            assertAllowedRedirect(data.redirectTo, [
              process.env.APP_ORIGIN ?? "",
              process.env.VITE_APP_ORIGIN ?? "",
            ].filter(Boolean));
          } catch (e) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: e instanceof Error ? e.message : "URL de redirecionamento não permitida",
              path: ["redirectTo"],
            });
          }
        }
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await getSupabaseAdmin();
    const { data: profs, error: pErr } = await admin
      .from("profiles")
      .select("email, role")
      .eq("clinic_id", data.clinicId);
    if (pErr) throwDatabaseError(pErr);
    const adm = (profs ?? []).find((p) => p.role === "admin");
    if (!adm?.email) throw new Error("Nenhum admin encontrado para esta clínica.");

    const { error } = await admin.auth.admin.inviteUserByEmail(adm.email, {
      data: { role: "admin", clinic_id: data.clinicId },
      redirectTo: data.redirectTo,
    });
    if (error) throwDatabaseError(error);

    await logAuditInternal(context.supabase, {
      action: "clinic.invite_resend",
      entity: "clinic",
      recordId: data.clinicId,
      metadata: { email: adm.email },
    });

    return { ok: true, email: adm.email };
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
  .handler(async ({ data, context }) => {
    const admin = await getSupabaseAdmin();
    const patch: {
      name?: string;
      status?: string;
      expiration_date?: string | null;
    } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.status !== undefined) patch.status = data.status;
    if (data.expirationDate !== undefined) patch.expiration_date = data.expirationDate;
    const { error } = await admin.from("clinics").update(patch).eq("id", data.id);
    if (error) throwDatabaseError(error);

    await logAuditInternal(context.supabase, {
      action: "clinic.update",
      entity: "clinic",
      recordId: data.id,
      metadata: patch,
    });

    return { ok: true };
  });

export const deleteClinic = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await getSupabaseAdmin();
    const { data: profs } = await admin.from("profiles").select("id").eq("clinic_id", data.id);
    for (const p of profs ?? []) {
      await admin.auth.admin.deleteUser(p.id).catch(() => {});
    }
    const { error } = await admin.from("clinics").delete().eq("id", data.id);
    if (error) throwDatabaseError(error);

    await logAuditInternal(context.supabase, {
      action: "clinic.delete",
      entity: "clinic",
      recordId: data.id,
      metadata: { deleted_users: (profs ?? []).length },
    });

    return { ok: true };
  });
