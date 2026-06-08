import { describe, expect, it } from "vitest";
import {
  assertAdminRole,
  assertAttendanceWriter,
  assertPatientWriter,
  assertStaffRole,
  normalizeAppRole,
} from "@/lib/auth-guards";
import type { AppRole } from "@/lib/auth-guards";

describe("normalizeAppRole", () => {
  it("maps legacy user to usuario", () => {
    expect(normalizeAppRole("user")).toBe("usuario");
  });

  it("keeps current roles unchanged", () => {
    const roles: AppRole[] = ["super_admin", "admin", "contador", "operador", "usuario"];
    for (const role of roles) {
      expect(normalizeAppRole(role)).toBe(role);
    }
  });
});

describe("assertAdminRole", () => {
  it("allows admin only", () => {
    expect(() => assertAdminRole("admin")).not.toThrow();
    expect(() => assertAdminRole("operador")).toThrow();
    expect(() => assertAdminRole("contador")).toThrow();
    expect(() => assertAdminRole("usuario")).toThrow();
  });
});

describe("assertPatientWriter", () => {
  it("allows admin and operador", () => {
    expect(() => assertPatientWriter("admin")).not.toThrow();
    expect(() => assertPatientWriter("operador")).not.toThrow();
  });
  it("rejects contador and usuario", () => {
    expect(() => assertPatientWriter("contador")).toThrow();
    expect(() => assertPatientWriter("usuario")).toThrow();
  });
});

describe("assertAttendanceWriter", () => {
  it("allows admin and operador, rejects contador", () => {
    expect(() => assertAttendanceWriter("admin")).not.toThrow();
    expect(() => assertAttendanceWriter("operador")).not.toThrow();
    expect(() => assertAttendanceWriter("contador")).toThrow();
  });
});

describe("assertStaffRole", () => {
  it("allows admin, contador and operador", () => {
    expect(() => assertStaffRole("admin")).not.toThrow();
    expect(() => assertStaffRole("contador")).not.toThrow();
    expect(() => assertStaffRole("operador")).not.toThrow();
  });

  it("rejects usuario", () => {
    expect(() => assertStaffRole("usuario")).toThrow();
  });
});

