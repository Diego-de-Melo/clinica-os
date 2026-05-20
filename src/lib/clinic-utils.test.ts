import { describe, expect, it } from "vitest";
import {
  classifyClinic,
  countClinicsByLifecycle,
  filterClinics,
  isClinicExpired,
} from "@/lib/clinic-utils";

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

describe("classifyClinic", () => {
  it("marks expired clinics as vencida", () => {
    expect(classifyClinic({ status: "ativo", expiration_date: past })).toBe("vencida");
  });

  it("marks active non-expired as ativa", () => {
    expect(classifyClinic({ status: "ativo", expiration_date: future })).toBe("ativa");
  });

  it("marks inactive as inativa when not expired", () => {
    expect(classifyClinic({ status: "inativo", expiration_date: future })).toBe("inativa");
  });
});

describe("filterClinics", () => {
  const clinics = [
    { name: "Alpha Clínica", status: "ativo", expiration_date: future, admins: ["a@x.com"] },
    { name: "Beta", status: "inativo", expiration_date: future, admins: ["b@y.com"] },
  ];

  it("filters by clinic name", () => {
    expect(filterClinics(clinics, { search: "alpha" })).toHaveLength(1);
  });

  it("filters by admin email", () => {
    expect(filterClinics(clinics, { search: "b@y" })).toHaveLength(1);
  });

  it("filters by lifecycle", () => {
    expect(filterClinics(clinics, { lifecycle: "inativa" })).toHaveLength(1);
  });
});

describe("countClinicsByLifecycle", () => {
  it("aggregates counts", () => {
    const counts = countClinicsByLifecycle([
      { name: "A", status: "ativo", expiration_date: future, admins: [] },
      { name: "B", status: "inativo", expiration_date: future, admins: [] },
      { name: "C", status: "ativo", expiration_date: past, admins: [] },
    ]);
    expect(counts).toEqual({ ativa: 1, inativa: 1, vencida: 1 });
  });
});

describe("isClinicExpired", () => {
  it("returns false without expiration", () => {
    expect(isClinicExpired(null)).toBe(false);
  });
});
