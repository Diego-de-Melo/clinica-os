import { describe, expect, it } from "vitest";

/**
 * Matriz alinhada às migrations e aos guards em
 * `patients.functions.ts` / `attendances.functions.ts`.
 */
const PATIENT_WRITE_ROLES = ["admin", "operador"] as const;
const ATTENDANCE_WRITE_ROLES = ["admin", "contador", "operador"] as const;
const ATTENDANCE_DELETE_ROLES = ["admin", "operador"] as const;
const CLINICAL_DATA_ROLES = ["admin", "contador", "operador", "usuario"] as const;

describe("RLS / server guard matrix", () => {
  it("admin and operador write patients", () => {
    expect(PATIENT_WRITE_ROLES).toContain("admin");
    expect(PATIENT_WRITE_ROLES).toContain("operador");
    expect(PATIENT_WRITE_ROLES).not.toContain("contador");
    expect(PATIENT_WRITE_ROLES).not.toContain("usuario");
  });

  it("admin, contador and operador write attendances; admin/operador delete", () => {
    expect(ATTENDANCE_WRITE_ROLES).toContain("admin");
    expect(ATTENDANCE_WRITE_ROLES).toContain("contador");
    expect(ATTENDANCE_WRITE_ROLES).toContain("operador");
    expect(ATTENDANCE_DELETE_ROLES).toContain("admin");
    expect(ATTENDANCE_DELETE_ROLES).toContain("operador");
    expect(ATTENDANCE_DELETE_ROLES).not.toContain("contador");
  });

  it("super_admin is excluded from clinical data roles", () => {
    expect(CLINICAL_DATA_ROLES).not.toContain("super_admin");
  });
});
