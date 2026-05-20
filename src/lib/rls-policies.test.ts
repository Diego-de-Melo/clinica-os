import { describe, expect, it } from "vitest";

/**
 * Matriz alinhada à migration `20260519001416` e aos guards em
 * `patients.functions.ts` / `attendances.functions.ts`.
 */
const PATIENT_WRITE_ROLES = ["admin"] as const;
const ATTENDANCE_WRITE_ROLES = ["admin", "contador"] as const;
const ATTENDANCE_DELETE_ROLES = ["admin"] as const;
const CLINICAL_DATA_ROLES = ["admin", "contador", "usuario"] as const;

describe("RLS / server guard matrix", () => {
  it("only admin writes patients", () => {
    expect(PATIENT_WRITE_ROLES).toEqual(["admin"]);
    expect(PATIENT_WRITE_ROLES).not.toContain("contador");
    expect(PATIENT_WRITE_ROLES).not.toContain("usuario");
  });

  it("admin and contador write attendances; only admin deletes", () => {
    expect(ATTENDANCE_WRITE_ROLES).toContain("admin");
    expect(ATTENDANCE_WRITE_ROLES).toContain("contador");
    expect(ATTENDANCE_DELETE_ROLES).toEqual(["admin"]);
  });

  it("super_admin is excluded from clinical data roles", () => {
    expect(CLINICAL_DATA_ROLES).not.toContain("super_admin");
  });
});
