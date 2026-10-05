import { describe, expect, it } from "vitest";
import { redactMetadata } from "./audit-redact";

describe("redactMetadata", () => {
  it("CPF cru some e vira hash: + 12 hex", () => {
    const r = redactMetadata({ cpf: "12345678900" }) as Record<string, string>;
    expect(r.cpf).toMatch(/^hash:[0-9a-f]{12}$/);
  });

  it("cnpj também vira hash", () => {
    const r = redactMetadata({ cnpj: "12345678000199" }) as Record<string, string>;
    expect(r.cnpj).toMatch(/^hash:[0-9a-f]{12}$/);
  });

  it("name some vira [redacted]", () => {
    const r1 = redactMetadata({ name: "João" }) as Record<string, string>;
    expect(r1.name).toBe("[redacted]");
    const r2 = redactMetadata({ nome: "Maria" }) as Record<string, string>;
    expect(r2.nome).toBe("[redacted]");
  });

  it("email/admin_email/ip/user_agent somem", () => {
    const r = redactMetadata({
      email: "a@b.com",
      admin_email: "c@d.com",
      ip: "1.2.3.4",
      user_agent: "Mozilla",
    }) as Record<string, string>;
    expect(r.email).toBe("[redacted]");
    expect(r.admin_email).toBe("[redacted]");
    expect(r.ip).toBe("[redacted]");
    expect(r.user_agent).toBe("[redacted]");
  });

  it("father_cpf/mother_cpf/responsible_cpf viram hash", () => {
    const r = redactMetadata({
      father_cpf: "11122233344",
      mother_cpf: "55566677788",
      responsible_cpf: "99900011122",
    }) as Record<string, string>;
    expect(r.father_cpf).toMatch(/^hash:/);
    expect(r.mother_cpf).toMatch(/^hash:/);
    expect(r.responsible_cpf).toMatch(/^hash:/);
  });

  it("record_id/id/clinic_id/status/action preservados", () => {
    const r = redactMetadata({
      id: "uuid-1",
      clinic_id: "uuid-2",
      record_id: "uuid-3",
      status: "Emitido",
      action: "patient.create",
    }) as Record<string, string>;
    expect(r.id).toBe("uuid-1");
    expect(r.clinic_id).toBe("uuid-2");
    expect(r.record_id).toBe("uuid-3");
    expect(r.status).toBe("Emitido");
    expect(r.action).toBe("patient.create");
  });

  it("entrada undefined/null volta {}", () => {
    expect(redactMetadata(undefined as any)).toEqual({});
    expect(redactMetadata(null as any)).toEqual({});
  });

  it("aninhamento de 1 nível copiado e limpo", () => {
    const r = redactMetadata({
      paciente: { nome: "X", cpf: "111" },
      meta: [{ email: "a@b.com" }],
    }) as { paciente: { nome: string; cpf: string }; meta: Array<{ email: string }> };
    expect(r.paciente.nome).toBe("[redacted]");
    expect(r.paciente.cpf).toMatch(/^hash:/);
    expect(r.meta[0].email).toBe("[redacted]");
  });
});