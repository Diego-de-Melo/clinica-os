import { describe, expect, it } from "vitest";
import * as auditFunctions from "./audit.functions";

describe("audit.functions exports", () => {
  it("NÃO exporta logAudit (removida por segurança — A4)", () => {
    expect("logAudit" in auditFunctions).toBe(false);
  });

  it("exporta listAuditLogs (super_admin only)", () => {
    expect("listAuditLogs" in auditFunctions).toBe(true);
    expect(typeof auditFunctions.listAuditLogs).toBe("function");
  });

  it("exporta listClinicsForFilter", () => {
    expect("listClinicsForFilter" in auditFunctions).toBe(true);
  });

  it("exporta getAuditRetentionConfig", () => {
    expect("getAuditRetentionConfig" in auditFunctions).toBe(true);
  });

  it("exporta purgeOldAuditLogs", () => {
    expect("purgeOldAuditLogs" in auditFunctions).toBe(true);
  });
});