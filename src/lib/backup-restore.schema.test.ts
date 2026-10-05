import { describe, expect, it } from "vitest";
import { parseBackupSnapshot, buildUpsertPayload, type Snapshot } from "./backup-restore.schema";

const baseMeta = {
  version: 1,
  created_at: "2026-09-27T00:00:00Z",
  clinic_id: "11111111-1111-1111-1111-111111111111",
};

const validPatient = {
  id: "22222222-2222-2222-2222-222222222222",
  clinic_id: "11111111-1111-1111-1111-111111111111",
  name: "Paciente Teste",
  cpf: "12345678900",
  cnpj: null,
  company_name: null,
  father_name: null,
  father_cpf: null,
  mother_name: null,
  mother_cpf: null,
  phone: null,
  address: null,
  email: null,
  created_at: "2026-09-27T00:00:00Z",
  updated_at: null,
  deleted_at: null,
};

const validAttendance = {
  id: "33333333-3333-3333-3333-333333333333",
  clinic_id: "11111111-1111-1111-1111-111111111111",
  patient_id: "22222222-2222-2222-2222-222222222222",
  date: "2026-09-27",
  value: 150,
  payment_method: "dinheiro",
  status: "Pendente" as const,
  invoice_for: "patient" as const,
  observacoes: null,
  created_at: "2026-09-27T00:00:00Z",
  updated_at: null,
  deleted_at: null,
};

const validClinic = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Clínica Teste",
  status: "ativo" as const,
  expiration_date: "2027-09-27T00:00:00Z",
  created_at: "2026-09-27T00:00:00Z",
  updated_at: null,
};

const validProfile = {
  id: "44444444-4444-4444-4444-444444444444",
  email: "admin@teste.com",
  role: "admin" as const,
  clinic_id: "11111111-1111-1111-1111-111111111111",
  created_at: "2026-09-27T00:00:00Z",
  updated_at: null,
};

const validSnapshot: Snapshot = {
  patients: [validPatient],
  attendances: [validAttendance],
  clinics: [validClinic],
  profiles: [validProfile],
  metadata: baseMeta,
};

describe("parseBackupSnapshot", () => {
  it("snapshot válido -> parseia", () => {
    expect(() => parseBackupSnapshot(validSnapshot)).not.toThrow();
  });

  it("linha com clinic_id extra -> rejeitada", () => {
    const bad = {
      ...validSnapshot,
      patients: [{ ...validPatient, clinic_id: "11111111-1111-1111-1111-111111111111", extra_field: "x" }],
    };
    expect(() => parseBackupSnapshot(bad)).toThrow();
  });

  it("campo desconhecido (role) -> rejeitado", () => {
    const bad = {
      ...validSnapshot,
      patients: [{ ...validPatient, role: "admin" }],
    };
    expect(() => parseBackupSnapshot(bad)).toThrow();
  });

  it("array com 50.001 itens -> rejeitado", () => {
    const many = Array.from({ length: 50_001 }, (_, i) => ({
      ...validPatient,
      id: `55555555-5555-5555-5555-${String(i).padStart(12, "0")}`,
    }));
    const bad = { ...validSnapshot, patients: many };
    expect(() => parseBackupSnapshot(bad)).toThrow();
  });

  it("id inválido (não uuid) -> rejeitado", () => {
    const bad = { ...validSnapshot, patients: [{ ...validPatient, id: "not-a-uuid" }] };
    expect(() => parseBackupSnapshot(bad)).toThrow();
  });
});

describe("buildUpsertPayload", () => {
  it("remove clinic_id das linhas de pacientes/atendimentos/profiles", () => {
    const payload = buildUpsertPayload(validSnapshot);
    expect(payload.patients[0]).not.toHaveProperty("clinic_id");
    expect(payload.attendances[0]).not.toHaveProperty("clinic_id");
    expect(payload.profiles[0]).not.toHaveProperty("clinic_id");
    // clinics mantém id (PK)
    expect(payload.clinics[0]).toHaveProperty("id", validClinic.id);
  });
});