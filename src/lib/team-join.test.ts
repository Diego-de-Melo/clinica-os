import { describe, expect, it } from "vitest";
import { joinDecision } from "./team-join";

describe("joinDecision", () => {
  it("profile === null -> attach", () => {
    const result = joinDecision(null);
    expect(result.mode).toBe("attach");
  });

  it("profile.clinic_id === null (super_admin) -> reject com menção a reenviar convite", () => {
    const result = joinDecision({
      clinic_id: null,
      role: "super_admin",
      email: "super@example.test",
    });
    expect(result.mode).toBe("reject");
    if (result.mode === "reject") {
      expect(result.reason).toContain("super administrador");
      expect(result.reason).toContain("reenviar");
    }
  });

  it("profile.clinic_id === outraClinica -> reject", () => {
    const result = joinDecision({
      clinic_id: "11111111-1111-1111-1111-111111111111",
      role: "admin",
      email: "outras@example.test",
    });
    expect(result.mode).toBe("reject");
    if (result.mode === "reject") {
      expect(result.reason).toContain("já possui cadastro");
    }
  });

  it("profile.clinic_id === clínica do chamador -> reject (já é membro)", () => {
    const result = joinDecision({
      clinic_id: "22222222-2222-2222-2222-222222222222",
      role: "admin",
      email: "mesma@example.test",
    });
    expect(result.mode).toBe("reject");
  });
});