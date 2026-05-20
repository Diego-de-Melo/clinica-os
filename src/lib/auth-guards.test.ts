import { describe, expect, it } from "vitest";
import {
  assertAdminRole,
  assertStaffRole,
  normalizeAppRole,
} from "@/lib/auth-guards";
import type { AppRole } from "@/lib/auth-guards";

describe("normalizeAppRole", () => {
  it("maps legacy user to usuario", () => {
    expect(normalizeAppRole("user")).toBe("usuario");
  });

  it("keeps current roles unchanged", () => {
    const roles: AppRole[] = ["super_admin", "admin", "contador", "usuario"];
    for (const role of roles) {
      expect(normalizeAppRole(role)).toBe(role);
    }
  });
});

describe("assertAdminRole", () => {
  it("allows admin", () => {
    expect(() => assertAdminRole("admin")).not.toThrow();
  });

  it("rejects contador and usuario", () => {
    expect(() => assertAdminRole("contador")).toThrow(/Admin/);
    expect(() => assertAdminRole("usuario")).toThrow(/Admin/);
  });
});

describe("assertStaffRole", () => {
  it("allows admin and contador", () => {
    expect(() => assertStaffRole("admin")).not.toThrow();
    expect(() => assertStaffRole("contador")).not.toThrow();
  });

  it("rejects usuario", () => {
    expect(() => assertStaffRole("usuario")).toThrow(/Contador/);
  });
});
