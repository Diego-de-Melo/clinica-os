import { describe, expect, it } from "vitest";
import { backupDownloadHeaders, sanitizeBackupFilename } from "./backup-download";

describe("backup-download helpers", () => {
  it("backupDownloadHeaders retorna Content-Type, Content-Disposition, Cache-Control", () => {
    const h = backupDownloadHeaders("clinica-1-backup-2026-09-27.json");
    expect(h["Content-Type"]).toBe("application/json; charset=utf-8");
    expect(h["Content-Disposition"]).toBe('attachment; filename="clinica-1-backup-2026-09-27.json"');
    expect(h["Cache-Control"]).toBe("no-store");
  });

  it("backupDownloadHeaders não tem aspas no filename (sanitize remove antes)", () => {
    const h = backupDownloadHeaders('backup"com"aspas.json');
    // sanitizeBackupFilename remove aspas antes de escapar, então não há aspas no resultado
    expect(h["Content-Disposition"]).toBe('attachment; filename="backupcomaspas.json"');
  });

  it("sanitizeBackupFilename neutraliza ../ e aspas", () => {
    expect(sanitizeBackupFilename("cli", "../evil.json")).toBe("evil.json");
    expect(sanitizeBackupFilename("cli", 'a"b.json')).toBe("ab.json");
    expect(sanitizeBackupFilename("cli", "normal.json")).toBe("normal.json");
    expect(sanitizeBackupFilename("cli", "a\tb.json")).toBe("ab.json");
  });

  it("sanitizeBackupFilename mantém só [a-zA-Z0-9._-]", () => {
    // remove espaço, @, # -> "abc.json"
    expect(sanitizeBackupFilename("cli", "a b@c#.json")).toBe("abc.json");
  });
});