import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runBackupForClinic, purgeExpiredBackups } from "@/lib/backups.server";

export const Route = createFileRoute("/api/public/hooks/run-clinic-backups")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Autorização: apenas service role key
        const auth = request.headers.get("authorization");
        const expectedService = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!auth || !expectedService || auth !== `Bearer ${expectedService}`) {
          return new Response("Unauthorized", { status: 401 });
        }

        const startedAt = Date.now();
        const results: Array<{ clinicId: string; ok: boolean; error?: string }> = [];

        const { data: configs, error } = await supabaseAdmin
          .from("backup_configs")
          .select("clinic_id, retention_days, enabled, clinics:clinic_id(status, expiration_date)")
          .eq("enabled", true);

        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        for (const cfg of configs ?? []) {
          const clinic = (cfg as { clinics?: { status: string; expiration_date: string | null } })
            .clinics;
          if (!clinic) continue;
          const expired =
            clinic.expiration_date && new Date(clinic.expiration_date).getTime() < Date.now();
          if (clinic.status !== "ativo" || expired) continue;

          try {
            const r = await runBackupForClinic(cfg.clinic_id, "system");
            await supabaseAdmin
              .from("backup_configs")
              .update({
                last_run_at: new Date().toISOString(),
                last_status: "success",
                last_error: null,
              })
              .eq("clinic_id", cfg.clinic_id);
            await purgeExpiredBackups(cfg.clinic_id, cfg.retention_days);
            await supabaseAdmin.rpc("log_audit", {
              _action: "backup.run",
              _entity: "backups",
              _record_id: r.backupId,
              _metadata: {
                trigger: "cron",
                version: r.version,
                size: r.sizeBytes,
                counts: r.counts,
              } as never,
            });
            results.push({ clinicId: cfg.clinic_id, ok: true });
          } catch (e) {
            const msg = e instanceof Error ? e.message : "erro";
            await supabaseAdmin
              .from("backup_configs")
              .update({
                last_run_at: new Date().toISOString(),
                last_status: "failed",
                last_error: msg,
              })
              .eq("clinic_id", cfg.clinic_id);
            results.push({ clinicId: cfg.clinic_id, ok: false, error: msg });
          }
        }

        return Response.json({
          ok: true,
          processed: results.length,
          duration_ms: Date.now() - startedAt,
          results,
        });
      },
    },
  },
});
