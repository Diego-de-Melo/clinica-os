import { describe, expect, it } from "vitest";
import { anonymizePatch } from "./lgpd-anonymize";

describe("anonymizePatch", () => {
  const fullRow = {
    name: "João Silva",
    cpf: "12345678900",
    father_name: "José Silva",
    father_cpf: "11122233344",
    mother_name: "Maria Silva",
    mother_cpf: "55566677788",
    cnpj: "12345678000199",
    company_name: "Empresa LTDA",
    responsible_name: "Responsável",
    responsible_cpf: "99900011122",
  };

  it("anonimiza todos os campos de dados pessoais", () => {
    const patch = anonymizePatch(fullRow);
    expect(patch.name).toBe("[anonimizado]");
    expect(patch.cpf).toBeNull();
    expect(patch.father_name).toBeNull();
    expect(patch.father_cpf).toBeNull();
    expect(patch.mother_name).toBeNull();
    expect(patch.mother_cpf).toBeNull();
    expect(patch.cnpj).toBeNull();
    expect(patch.company_name).toBeNull();
    expect(patch.responsible_name).toBeNull();
    expect(patch.responsible_cpf).toBeNull();
  });

  it("preserva campos não listados (id, clinic_id, deleted_at não estão no input)", () => {
    const patch = anonymizePatch(fullRow);
    expect(Object.keys(patch).sort()).toEqual([
      "cnpj",
      "company_name",
      "cpf",
      "father_cpf",
      "father_name",
      "mother_cpf",
      "mother_name",
      "name",
      "responsible_cpf",
      "responsible_name",
    ]);
  });

  it("funciona com valores já nulos", () => {
    const sparse = { ...fullRow, cpf: null, father_name: null };
    const patch = anonymizePatch(sparse);
    expect(patch.cpf).toBeNull();
    expect(patch.father_name).toBeNull();
  });
});