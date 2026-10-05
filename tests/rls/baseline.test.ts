/**
 * Baseline do harness: estes três casos precisam passar ANTES de qualquer
 * correção. Se falharem, o harness está errado (medindo nada), não a RLS.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  anonClient,
  createTenant,
  resetStack,
  seedAttendance,
  seedPatient,
  type Tenant,
} from "./helpers";

const TABELAS_PROTEGIDAS = [
  "patients",
  "attendances",
  "clinics",
  "audit_logs",
  "backups",
  "profiles",
] as const;

describe("baseline do harness de RLS", () => {
  let clinicaA: Tenant;
  let clinicaB: Tenant;
  let pacienteA: string;
  let atendimentoA: string;

  beforeAll(async () => {
    await resetStack();
    clinicaA = await createTenant({ name: "Clínica A", role: "admin" });
    clinicaB = await createTenant({ name: "Clínica B", role: "admin" });
    pacienteA = await seedPatient(clinicaA, { name: "Paciente da Clínica A" });
    atendimentoA = await seedAttendance(clinicaA, pacienteA);
  }, 300_000);

  it("anon não lê patients/attendances/clinics/audit_logs/backups/profiles", async () => {
    const anon = await anonClient();
    for (const tabela of TABELAS_PROTEGIDAS) {
      const { data, error } = await anon.from(tabela).select("*");
      expect(error, `${tabela}: erro inesperado ${error?.message}`).toBeNull();
      expect(data ?? [], `${tabela} visível para anon`).toHaveLength(0);
    }
  });

  it("sessão da clínica B não vê patients/attendances da clínica A", async () => {
    const { data: patients, error: patientsError } = await clinicaB.client
      .from("patients")
      .select("id");
    expect(patientsError).toBeNull();
    expect(patients ?? [], "patients da clínica A vazando para a B").toHaveLength(0);

    const { data: attendances, error: attendancesError } = await clinicaB.client
      .from("attendances")
      .select("id");
    expect(attendancesError).toBeNull();
    expect(attendances ?? [], "attendances da clínica A vazando para a B").toHaveLength(0);
  });

  it("sessão da clínica A lê o próprio paciente e atendimento", async () => {
    const { data: patients, error: patientsError } = await clinicaA.client
      .from("patients")
      .select("id")
      .eq("id", pacienteA);
    expect(patientsError).toBeNull();
    expect(patients ?? []).toHaveLength(1);

    const { data: attendances, error: attendancesError } = await clinicaA.client
      .from("attendances")
      .select("id")
      .eq("id", atendimentoA);
    expect(attendancesError).toBeNull();
    expect(attendances ?? []).toHaveLength(1);
  });
});
