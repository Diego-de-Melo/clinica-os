import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { encryptBuffer } from "./backup-crypto.server";

const BUCKET = "clinic-backups";

export type BackupRunResult = {
  backupId: string;
  version: number;
  sizeBytes: number;
  counts: Record<string, number>;
  objectPath: string;
};

export async function runBackupForClinic(
  clinicId: string,
  createdBy: string,
): Promise<BackupRunResult> {
  // Coleta dados
  const [clinicRes, patientsRes, attendancesRes, consentsRes] = await Promise.all([
    supabaseAdmin.from("clinics").select("*").eq("id", clinicId).maybeSingle(),
    supabaseAdmin.from("patients").select("*").eq("clinic_id", clinicId),
    supabaseAdmin.from("attendances").select("*").eq("clinic_id", clinicId),
    supabaseAdmin.from("consents").select("*").eq("clinic_id", clinicId),
  ]);

  const snapErr =
    clinicRes.error ?? patientsRes.error ?? attendancesRes.error ?? consentsRes.error;
  if (snapErr) {
    console.error("[backup] snapshot failed", snapErr);
    throw new Error("Falha ao gerar backup. Tente novamente.");
  }

  const payload = {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    clinic: clinicRes.data,
    patients: patientsRes.data ?? [],
    attendances: attendancesRes.data ?? [],
    consents: consentsRes.data ?? [],
  };

  const counts = {
    patients: payload.patients.length,
    attendances: payload.attendances.length,
    consents: payload.consents.length,
  };

  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const { ciphertext, iv, authTag, checksum } = encryptBuffer(plaintext);

  // Próxima versão
  const { data: lastVer } = await supabaseAdmin
    .from("backups")
    .select("version")
    .eq("clinic_id", clinicId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (lastVer?.version ?? 0) + 1;

  const date = new Date().toISOString().slice(0, 10);
  const objectPath = `${clinicId}/${date}-v${version}.bin`;

  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(objectPath, ciphertext, {
      contentType: "application/octet-stream",
      upsert: true,
    });
  if (upErr) {
    console.error("[backup] upload failed", upErr);
    throw new Error("Falha ao salvar o backup. Tente novamente.");
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("backups")
    .insert({
      clinic_id: clinicId,
      version,
      size_bytes: ciphertext.byteLength,
      record_counts: counts,
      object_path: objectPath,
      iv,
      auth_tag: authTag,
      checksum_sha256: checksum,
      status: "success",
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (insErr) {
    console.error("[backup] insert failed", insErr);
    throw new Error("Falha ao registrar o backup. Tente novamente.");
  }

  return {
    backupId: inserted.id,
    version,
    sizeBytes: ciphertext.byteLength,
    counts,
    objectPath,
  };
}

export async function purgeExpiredBackups(clinicId: string, retentionDays: number) {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  const { data: expired, error } = await supabaseAdmin
    .from("backups")
    .select("id, object_path")
    .eq("clinic_id", clinicId)
    .lt("created_at", cutoff);
  if (error || !expired || expired.length === 0) return 0;

  await supabaseAdmin.storage.from(BUCKET).remove(expired.map((b) => b.object_path));
  await supabaseAdmin.from("backups").delete().in("id", expired.map((b) => b.id));
  return expired.length;
}

export async function downloadAndDecrypt(backupId: string, clinicId: string): Promise<Buffer> {
  const { data: bk, error } = await supabaseAdmin
    .from("backups")
    .select("object_path, iv, auth_tag, clinic_id")
    .eq("id", backupId)
    .maybeSingle();
  if (error || !bk) throw new Error("Backup não encontrado");
  if (bk.clinic_id !== clinicId) throw new Error("Backup não pertence à clínica");

  const { data: file, error: dlErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(bk.object_path);
  if (dlErr || !file) throw new Error(`download: ${dlErr?.message ?? "vazio"}`);

  const cipherBuf = Buffer.from(await file.arrayBuffer());
  const { decryptBuffer } = await import("./backup-crypto.server");
  return decryptBuffer(cipherBuf, bk.iv, bk.auth_tag);
}

export async function createSignedTempDownload(
  clinicId: string,
  backupId: string,
): Promise<{ url: string; expiresIn: number; filename: string }> {
  const plaintext = await downloadAndDecrypt(backupId, clinicId);
  const tmpPath = `tmp/${clinicId}/${backupId}-${Date.now()}.json`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(tmpPath, plaintext, {
      contentType: "application/json",
      upsert: true,
    });
  if (upErr) throw new Error(`tmp upload: ${upErr.message}`);

  const { data: signed, error: sigErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(tmpPath, 60 * 15, {
      download: `backup-${backupId}.json`,
    });
  if (sigErr || !signed) throw new Error(`sign: ${sigErr?.message ?? "vazio"}`);

  return {
    url: signed.signedUrl,
    expiresIn: 60 * 15,
    filename: `backup-${backupId}.json`,
  };
}
