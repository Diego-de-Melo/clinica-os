import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Bootstrap: cria o PRIMEIRO super admin se não houver nenhum no sistema.
export const bootstrapSuperAdmin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(8).max(72),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("role", "super_admin")
      .limit(1);

    if (existing && existing.length > 0) {
      throw new Error("Super admin já configurado.");
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { role: "super_admin" },
    });

    if (error) throw new Error(error.message);
    return { ok: true, userId: created.user?.id };
  });

export const isSuperAdminConfigured = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("role", "super_admin")
      .limit(1);
    return { configured: (data?.length ?? 0) > 0 };
  },
);
