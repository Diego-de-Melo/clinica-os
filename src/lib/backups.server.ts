import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { encryptBuffer, decryptBuffer, verifyChecksum, getKey } from "./backup-crypto.server";

const BUCKET = "clinic-backups";
const MAX_BACKUP_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

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
  if (plaintext.byteLength > MAX_BACKUP_SIZE_BYTES) {
    throw new Error("Backup excede o limite de 50 MB. Reduza os dados antes de continuar.");
  }

  // Próxima versão (precisa antes do AAD)
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

  const aad = `${clinicId}:${objectPath}`;
  const { ciphertext, iv, authTag, checksum } = encryptBuffer(plaintext, aad);

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
    .select("object_path, iv, auth_tag, checksum_sha256, clinic_id")
    .eq("id", backupId)
    .maybeSingle();
  if (error || !bk) throw new Error("Backup não encontrado");
  if (bk.clinic_id !== clinicId) throw new Error("Backup não pertence à clínica");

  const { data: file, error: dlErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(bk.object_path);
  if (dlErr || !file) {
    if (dlErr) console.error("[backup] download failed", dlErr);
    throw new Error("Não foi possível baixar o backup.");
  }

  const cipherBuf = Buffer.from(await file.arrayBuffer());
  const aad = `${clinicId}:${bk.object_path}`;
  const { decryptBuffer, verifyChecksum, getKey } = await import("./backup-crypto.server");

  const plaintext = decryptBuffer(cipherBuf, bk.iv, bk.auth_tag, aad);

  // Verify checksum (novo HMAC ou legado sha256)
  if (bk.checksum_sha256) {
    const key = getKey();
    const ok = verifyChecksum(plaintext, cipherBuf, bk.checksum_sha256, key);
    if (!ok) {
      throw new Error("Backup corrompido: checksum não confere.");
    }
  }

  return plaintext;
}
