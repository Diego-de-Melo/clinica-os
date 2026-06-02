import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeAppRole, type AppRole } from "@/lib/auth-guards";
import { throwDatabaseError } from "@/lib/safe-errors";

export type { AppRole };

export type SessionContext = {
  userId: string;
  email: string;
  role: AppRole;
  clinicId: string | null;
  clinicStatus: "ativo" | "inativo" | null;
  clinicName: string | null;
  expirationDate: string | null;
  isBlocked: boolean;
};

export const getSessionContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SessionContext> => {
    const { supabase, userId, claims } = context;
    const email = (claims.email as string) ?? "";

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role, clinic_id")
      .eq("id", userId)
      .maybeSingle();

    if (error) throwDatabaseError(error);
    if (!profile) {
      return {
        userId, email, role: "usuario",
        clinicId: null, clinicStatus: null, clinicName: null, expirationDate: null,
        isBlocked: true,
      };
    }

    let clinicStatus: "ativo" | "inativo" | null = null;
    let clinicName: string | null = null;
    let expirationDate: string | null = null;

    if (profile.clinic_id) {
      const { data: clinic } = await supabase
        .from("clinics")
        .select("status, name, expiration_date")
        .eq("id", profile.clinic_id)
        .maybeSingle();
      if (clinic) {
        clinicStatus = clinic.status as "ativo" | "inativo";
        clinicName = clinic.name;
        expirationDate = clinic.expiration_date;
      }
    }

    const role = normalizeAppRole(profile.role);

    const isSuperAdmin = role === "super_admin";
    const expired = expirationDate ? new Date(expirationDate).getTime() < Date.now() : false;
    const isBlocked =
      !isSuperAdmin &&
      (profile.clinic_id == null || clinicStatus !== "ativo" || expired);

    return {
      userId, email, role,
      clinicId: profile.clinic_id,
      clinicStatus, clinicName, expirationDate, isBlocked,
    };
  });
