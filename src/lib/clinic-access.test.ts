import { describe, expect, it } from "vitest";
import { evaluateClinicAccess } from "./clinic-access";

describe("evaluateClinicAccess", () => {
  const FIXED_NOW = new Date("2026-01-01T00:00:00Z").getTime();

  it("ativo + futura -> active", () => {
    expect(
      evaluateClinicAccess({
        status: "ativo",
        expirationDate: "2027-01-01T00:00:00Z",
        role: "admin",
        now: FIXED_NOW,
      }),
    ).toEqual({ active: true });
  });

  it("ativo + passada -> bloqueado", () => {
    expect(
      evaluateClinicAccess({
        status: "ativo",
        expirationDate: "2025-01-01T00:00:00Z",
        role: "admin",
        now: FIXED_NOW,
      }),
    ).toEqual({ active: false, reason: "Clínica vencida." });
  });

  it("inativo -> bloqueado", () => {
    expect(
      evaluateClinicAccess({
        status: "inativo",
        expirationDate: "2027-01-01T00:00:00Z",
        role: "admin",
        now: FIXED_NOW,
      }),
    ).toEqual({ active: false, reason: "Clínica inativa." });
  });

  it("super_admin com datas nulas -> active", () => {
    expect(
      evaluateClinicAccess({
        status: "inativo",
        expirationDate: null,
        role: "super_admin",
        now: FIXED_NOW,
      }),
    ).toEqual({ active: true });
  });
});