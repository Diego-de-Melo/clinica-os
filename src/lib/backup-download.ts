/**
 * Helpers para download de backup sem plaintext no bucket.
 * O cliente baixa via fetch da server function e cria blob local.
 * Nenhum objeto descriptografado é gravado no Storage.
 */
export function backupDownloadHeaders(filename: string): Record<string, string> {
  const safe = sanitizeBackupFilename("", filename);
  return {
    "Content-Type": "application/json; charset=utf-8",
    'Content-Disposition': `attachment; filename="${safe.replace(/"/g, '""')}"`,
    "Cache-Control": "no-store",
  };
}

export function bufferToBodyInit(buf: Buffer): BodyInit {
  // Buffer pode ser SharedArrayBuffer-backed; copiamos para ArrayBuffer seguro
  const ab = buf.buffer instanceof ArrayBuffer ? buf.buffer : Uint8Array.from(buf).buffer;
  return new Blob([new Uint8Array(ab)]);
}

/** Só permite [a-zA-Z0-9._-] — remove path traversal, aspas, espaços, controles. */
export function sanitizeBackupFilename(_clinicId: string, filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "");
}