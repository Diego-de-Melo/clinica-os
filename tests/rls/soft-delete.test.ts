/**
 * Teste de C1: soft_delete_attendance deve conferir tenant, clínica ativa e papel.
 * Espera-se que retorne true só quando o atendimento pertence à clínica do chamador,
 * clínica está ativa e papel é admin/operador; false nos demais casos (nunca exceção).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  createTenant,
  resetStack,
  seedAttendance,
  seedPatient,
  type Tenant,
} from "./helpers";

describe("soft_delete_attendance", () => {
  let clinicaA: Tenant;
  let clinicaB: Tenant;
  let clinicaInativa: Tenant;
  let usuarioA: Tenant;
  let pacienteA: string;
  let atendimentoA: string;

  beforeAll(async () => {
    await resetStack();
    clinicaA = await createTenant({ name: "Clínica A", role: "admin" });
    clinicaB = await createTenant({ name: "Clínica B", role: "admin" });
    clinicaInativa = await createTenant({
      name: "Clínica Inativa",
      role: "admin",
      status: "inativo",
    });
    usuarioA = await createTenant({ name: "Clínica A (usuario)", role: "usuario" });
    pacienteA = await seedPatient(clinicaA, { name: "Paciente da Clínica A" });
    atendimentoA = await seedAttendance(clinicaA, pacienteA);
  }, 300_000);

  it("admin da clínica A apaga atendimento da A -> true + deleted_at preenchido", async () => {
    const svc = await (await import("./helpers")).serviceClient();
    const { data, error } = await svc.rpc("soft_delete_attendance", {
      p_id: atendimentoA,
    });
    expect(error).toBeNull();
    expect(data).toBe(true);

    const { data: att, error: attError } = await svc
      .from("attendances")
      .select("deleted_at")
      .eq("id", atendimentoA)
      .single();
    expect(attError).toBeNull();
    expect(att?.deleted_at).not.toBeNull();
  });

  it("admin da clínica B apaga atendimento da A -> false + deleted_at continua null", async () => {
    const svc = await (await import("./helpers")).serviceClient();
    const { data, error } = await clinicaB.client.rpc("soft_delete_attendance", {
      p_id: atendimentoA,
    });
    expect(error).toBeNull();
    expect(data).toBe(false);

    const { data: att, error: attError } = await svc
      .from("attendances")
      .select("deleted_at")
      .eq("id", atendimentoA)
      .single();
    expect(attError).toBeNull();
    expect(att?.deleted_at).toBeNull();
  });

  it("usuario (papel não assistencial) da clínica A apaga da A -> false", async () => {
    const { data, error } = await usuarioA.client.rpc("soft_delete_attendance", {
      p_id: atendimentoA,
    });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it("clínica inativa -> false", async () => {
    const pacienteInativa = await seedPatient(clinicaInativa);
    const atendimentoInativa = await seedAttendance(
      clinicaInativa,
      pacienteInativa,
    );

    const { data, error } = await clinicaInativa.client.rpc(
      "soft_delete_attendance",
      { p_id: atendimentoInativa },
    );
    expect(error).toBeNull();
    expect(data).toBe(false);
  });
});