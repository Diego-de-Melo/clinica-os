import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DashboardSummary = {
  total_patients: number;
  total_attendances: number;
  revenue: number;
  by_status: Record<string, number>;
};

export const getDashboardSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: summary, error } = await supabase.rpc("dashboard_summary", {
      _from: data.from ?? undefined,
      _to: data.to ?? undefined,
    });
    if (error) throw new Error(error.message);
    return (summary as unknown as DashboardSummary) ?? {
      total_patients: 0, total_attendances: 0, revenue: 0, by_status: {},
    };
  });
